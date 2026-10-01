import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Briefcase,
  CalendarDays,
  ChevronRight,
  Copy,
  Mail,
  Phone,
  Upload,
  UserPlus,
  UserRound,
} from "lucide-react";
import {
  clientSchema,
  type ClientInput,
} from "../../../packages/contracts/src/index";
import { api, useData, useWrite } from "./api";
import {
  Avatar,
  Back,
  FormError,
  Loading,
  Modal,
  PageHeading,
  Panel,
  Submit,
  useAuth,
  useToast,
} from "./components";
import {
  AdditionalDetails,
  FinancialProfile,
  Preferences,
  ReviewSummary,
  type OnboardingProfile,
} from "./ClientOnboardingSections";
const steps = [
  "Basic Information",
  "Additional Details",
  "Financial Profile",
  "Preferences",
  "Review",
];
export default function ClientForm() {
  const { id } = useParams(),
    user = useAuth(),
    navigate = useNavigate(),
    toast = useToast(),
    existing = useData("/clients/" + id, !!id),
    write = useWrite();
  const draftKey = `parvath-draft-${user.organizationId}-${user.userId}`;
  const [step, setStep] = useState(0),
    [photo, setPhoto] = useState<File>(),
    [duplicate, setDuplicate] = useState(false),
    [duplicateReason, setDuplicateReason] = useState(""),
    [copy, setCopy] = useState(false),
    [recovered, setRecovered] = useState(false),
    [profile, setProfile] = useState<OnboardingProfile>({
      sameAddress: true,
      communicationChannels: ["WhatsApp"],
    });
  const photoInput = useRef<HTMLInputElement>(null);
  const form = useForm<ClientInput>({
    resolver: zodResolver(clientSchema) as any,
    defaultValues: {
      name: "",
      phone: "",
      email: "",
      kind: "Individual",
      source: "Direct",
      gender: "",
      preferredContact: "WhatsApp",
      allowDuplicate: false,
    },
  });
  const {
    register,
    watch,
    reset,
    trigger,
    handleSubmit,
    formState: { errors },
    setValue,
  } = form;
  const kind = watch("kind");
  useEffect(() => {
    if (existing.data) {
      const c = existing.data.data;
      reset({
        ...c,
        dob: c.dob?.slice(0, 10) || "",
        registrationNumber: c.business?.registrationNumber || "",
        industry: c.business?.industry || "",
      });
      setProfile(c.onboardingProfile || { sameAddress: true });
    } else if (!id) {
      try {
        const d = JSON.parse(localStorage.getItem(draftKey) || "null");
        if (d) {
          reset(d.form || d);
          if (d.profile) setProfile(d.profile);
          setRecovered(true);
        }
      } catch {
        /* Ignore obsolete draft */
      }
    }
  }, [existing.data, id, reset, draftKey]);
  useEffect(() => {
    if (id) return;
    localStorage.setItem(
      draftKey,
      JSON.stringify({ form: form.getValues(), profile }),
    );
    const s = watch((v) =>
      localStorage.setItem(draftKey, JSON.stringify({ form: v, profile })),
    );
    return () => s.unsubscribe();
  }, [watch, draftKey, id, profile]);
  const submit = handleSubmit(async (values) => {
    try {
      const result = await write.mutateAsync({
        path: id ? "/clients/" + id : "/clients",
        method: id ? "PATCH" : "POST",
        body: {
          ...values,
          onboardingProfile: profile,
          allowDuplicate: duplicate,
          duplicateReason,
        },
      });
      localStorage.removeItem(draftKey);
      if (photo) {
        const body = new FormData();
        body.append("file", photo);
        body.append("purpose", "Photo");
        try {
          await api(`/clients/${result.data.id}/documents`, {
            method: "POST",
            body,
          });
        } catch (e) {
          toast("Client saved. Photo upload: " + (e as Error).message);
        }
      }
      toast(id ? "Client details updated" : "Client created successfully");
      navigate(
        id
          ? "/clients/" + result.data.id
          : "/clients/" + result.data.id + "/success",
      );
    } catch (e) {
      if ((e as any).status === 409 && Array.isArray((e as any).details))
        setDuplicate(true);
    }
  });
  const next = async () => {
    if (step === 0 && !(await trigger(["name", "phone", "email", "dob"])))
      return;
    setStep(Math.min(4, step + 1));
  };
  const field = (
    name: keyof ClientInput,
    label: string,
    placeholder = "",
    type = "text",
  ) => (
    <label className="field" key={name}>
      {label}
      <span className="input-with-icon">
        {name === "name" ? (
          <UserRound size={18} />
        ) : name === "phone" ? (
          <Phone size={18} />
        ) : name === "email" ? (
          <Mail size={18} />
        ) : name === "dob" ? (
          <CalendarDays size={18} />
        ) : (
          <Briefcase size={18} />
        )}
        <input
          type={type}
          aria-label={label}
          {...register(name as any)}
          placeholder={placeholder}
          aria-invalid={!!errors[name]}
        />
      </span>
      {errors[name] && (
        <small className="field-error">{String(errors[name]?.message)}</small>
      )}
    </label>
  );
  if (id && existing.isPending) return <Loading />;
  return (
    <div className="onboarding">
      <Back />
      <PageHeading
        title={id ? "Edit Client" : "Add New Client"}
        subtitle="Add client details to start managing their financial journey."
      />
      {recovered && (
        <div className="draft-notice">
          Your saved draft has been recovered.
          <button
            className="text-link"
            onClick={() => {
              reset({
                name: "",
                phone: "",
                email: "",
                kind: "Individual",
                gender: "",
                source: "Direct",
                preferredContact: "",
              });
              setRecovered(false);
              localStorage.removeItem(draftKey);
            }}
          >
            Discard draft
          </button>
        </div>
      )}
      <div className="stepper">
        {steps.map((s, i) => (
          <button
            key={s}
            className={step === i ? "current" : step > i ? "done" : ""}
            onClick={() => (i < step ? setStep(i) : void next())}
          >
            <span>{i + 1}</span>
            {s}
          </button>
        ))}
      </div>
      <form onSubmit={submit}>
        <div className={`onboarding-layout step-${step}`}>
          <Panel className="onboarding-main">
            <div
              className="panel-heading"
              style={step === 4 ? { display: "none" } : undefined}
            >
              <div>
                <h2>{steps[step]}</h2>
                <p>
                  {step === 0
                    ? "Enter the client's personal and contact details."
                    : step === 4
                      ? "Review the details below before saving."
                      : "Add the details you know. You can update the rest later."}
                </p>
              </div>
              <small>
                All fields marked <b className="required">*</b> are required
              </small>
            </div>
            {step === 0 ? (
              <div className="form-grid">
                {field(
                  "name",
                  kind === "Business" ? "Business Name *" : "Full Name *",
                  kind === "Business"
                    ? "Enter business name"
                    : "Enter full name",
                )}
                {field("phone", "Phone Number *", "+91 90000 00000", "tel")}
                {field(
                  "email",
                  "Email Address",
                  "Enter email address",
                  "email",
                )}
                <fieldset>
                  <legend>Client Type *</legend>
                  <div className="choice-row">
                    <label>
                      <input
                        {...register("kind")}
                        value="Individual"
                        type="radio"
                      />
                      Individual
                    </label>
                    <label>
                      <input
                        {...register("kind")}
                        value="Business"
                        type="radio"
                      />
                      Business
                    </label>
                  </div>
                </fieldset>
                {kind === "Individual" ? (
                  <>
                    {field("dob", "Date of Birth", "", "date")}
                    <fieldset>
                      <legend>Gender</legend>
                      <div className="choice-row">
                        {["Male", "Female", "Other"].map((g) => (
                          <label key={g}>
                            <input
                              {...register("gender")}
                              value={g}
                              type="radio"
                            />
                            {g}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    {field("occupation", "Occupation", "Enter occupation")}
                  </>
                ) : (
                  <>
                    {field(
                      "registrationNumber",
                      "Registration Number",
                      "Company / GST registration",
                    )}
                    {field("industry", "Industry", "Enter industry")}
                    <div className="muted">
                      Link existing contact people from the client profile after
                      saving.
                    </div>
                  </>
                )}
                <fieldset>
                  <legend>Preferred Contact Method</legend>
                  <div className="choice-row">
                    {["WhatsApp", "Call", "Email"].map((m) => (
                      <label key={m}>
                        <input
                          type="checkbox"
                          checked={(
                            profile.communicationChannels || []
                          ).includes(m === "Call" ? "Phone Call" : m)}
                          onChange={(e) => {
                            const value = m === "Call" ? "Phone Call" : m;
                            const current = profile.communicationChannels || [];
                            const channels = e.target.checked
                              ? [...current, value]
                              : current.filter((c) => c !== value);
                            setProfile({
                              ...profile,
                              communicationChannels: channels,
                            });
                            setValue(
                              "preferredContact",
                              channels[0] === "Phone Call"
                                ? "Call"
                                : channels[0] || "",
                            );
                          }}
                        />
                        {m}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="onboard-photo-inline">
                  <div className="onboard-avatar">
                    <Avatar
                      name={watch("name") || "New Client"}
                      photoUrl={photo ? URL.createObjectURL(photo) : undefined}
                      animate="always"
                    />
                  </div>
                  <div>
                    <strong>Profile Photo</strong>
                    <button
                      type="button"
                      onClick={() => photoInput.current?.click()}
                    >
                      <Upload size={16} /> {photo ? photo.name : "Upload Photo"}
                    </button>
                    <small>JPG or PNG, maximum 10 MB</small>
                    <input
                      ref={photoInput}
                      hidden
                      type="file"
                      accept="image/jpeg,image/png"
                      onChange={(e) => setPhoto(e.target.files?.[0])}
                    />
                  </div>
                </div>
              </div>
            ) : step === 1 ? (
              <AdditionalDetails
                profile={profile}
                setProfile={setProfile}
                form={form}
              />
            ) : step === 2 ? (
              <FinancialProfile
                profile={profile}
                setProfile={setProfile}
                form={form}
              />
            ) : step === 3 ? (
              <Preferences
                profile={profile}
                setProfile={setProfile}
                form={form}
              />
            ) : (
              <ReviewSummary
                profile={profile}
                setProfile={setProfile}
                form={form}
                goTo={setStep}
                editing={!!id}
              />
            )}
            <FormError error={write.error} />
            {duplicate && (
              <div className="duplicate-warning">
                <strong>Review possible duplicate</strong>
                <p>
                  A client already shares this phone or email. Confirm this is a
                  distinct person, such as a family member.
                </p>
                <label>
                  Reason for shared contact details
                  <input
                    value={duplicateReason}
                    onChange={(e) => setDuplicateReason(e.target.value)}
                    required
                    minLength={5}
                  />
                </label>
              </div>
            )}
          </Panel>
        </div>
        {step === 0 && (
          <div className="onboard-shortcuts">
            <button
              type="button"
              onClick={async () => {
                if (await trigger(["name", "phone", "email"])) setStep(4);
              }}
            >
              Add with Minimal Details
            </button>
            <button type="button" onClick={() => setCopy(true)}>
              <Copy size={14} /> Duplicate Existing Client
            </button>
            <Link to="/clients/import">
              <UserPlus size={14} /> Import from Contacts
            </Link>
          </div>
        )}
        <div className="form-footer">
          <Link className="button" to="/clients">
            Cancel
          </Link>
          <div>
            {step > 0 && (
              <button type="button" onClick={() => setStep(step - 1)}>
                Back
              </button>
            )}
            {step < 4 ? (
              <button
                className="primary"
                type="button"
                onClick={() => void next()}
              >
                Next: {steps[step + 1]} <ChevronRight size={18} />
              </button>
            ) : (
              <Submit busy={write.isPending}>
                {id ? "Save Changes" : "Create Client"}
              </Submit>
            )}
          </div>
        </div>
      </form>
      {copy && (
        <CopyContact
          onClose={() => setCopy(false)}
          onChoose={(c) => {
            reset({
              name: "",
              phone: c.phone,
              email: c.email,
              kind: c.kind,
              address: c.address,
              city: c.city,
              state: c.state,
              source: "Direct",
              preferredContact: "",
            });
            setProfile({ sameAddress: true, communicationChannels: [] });
            setCopy(false);
            setStep(0);
            toast(
              "Contact fields copied. Enter the distinct client name and review shared details.",
            );
          }}
        />
      )}
    </div>
  );
}
function CopyContact({
  onClose,
  onChoose,
}: {
  onClose: () => void;
  onChoose: (c: any) => void;
}) {
  const q = useData("/clients?limit=100");
  return (
    <Modal title="Copy contact fields" onClose={onClose}>
      <p>
        Choose a source. Only phone, email, address and client type are copied.
        Enter a new name and review duplicates before saving.
      </p>
      <div className="copy-list">
        {q.data?.data.map((c: any) => (
          <button key={c.id} onClick={() => onChoose(c)}>
            {c.name}
            <ChevronRight size={15} />
          </button>
        ))}
      </div>
    </Modal>
  );
}
