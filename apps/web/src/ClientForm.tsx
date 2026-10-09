import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  Briefcase,
  CalendarDays,
  ChevronRight,
  Mail,
  Phone,
  Upload,
  UserRound,
} from "lucide-react";
import {
  clientSchema,
  type ClientInput,
} from "../../../packages/contracts/src/index";
import { api, query, useData, useWrite } from "./api";
import Clients from "./Clients";
import { ProductClients } from "./Supporting";
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
export function NewClientPopup() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const category = params.get("productCategory");
  const close = () =>
    navigate(
      category
        ? "/products/new?" +
            query({ category, definitionId: params.get("definitionId") })
        : "/clients",
    );
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <>
      {category ? <ProductClients category={category} /> : <Clients />}
      <Modal
        title="Add New Client"
        className="client-onboarding-popup"
        onClose={close}
      >
        <ClientForm embedded onCancel={close} />
      </Modal>
    </>
  );
}

export default function ClientForm({
  embedded = false,
  onCancel,
}: {
  embedded?: boolean;
  onCancel?: () => void;
}) {
  const [productParams] = useSearchParams();
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
    [recovered, setRecovered] = useState(false),
    [profile, setProfile] = useState<OnboardingProfile>({
      sameAddress: true,
      communicationChannels: ["WhatsApp"],
    });
  const bodyRef = useRef<HTMLDivElement>(null);
  const [stepNotice, setStepNotice] = useState("");
  useEffect(() => setStepNotice(""), [step]);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [sectionTitles, setSectionTitles] = useState<string[]>([]);
  useLayoutEffect(() => {
    if (!embedded) return;
    const sections = Array.from(
      bodyRef.current?.querySelectorAll<HTMLElement>(".onboard-section") || [],
    );
    setSectionIndex(0);
    setSectionTitles(
      sections.map(
        (section) => section.querySelector("h3")?.textContent || "Details",
      ),
    );
  }, [embedded, step]);
  useLayoutEffect(() => {
    if (!embedded) return;
    const sections = Array.from(
      bodyRef.current?.querySelectorAll<HTMLElement>(".onboard-section") || [],
    );
    sections.forEach((section, index) => {
      section.style.display = index === sectionIndex ? "" : "none";
    });
  }, [embedded, step, sectionIndex, sectionTitles]);
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
        const draftValues = d?.form || d;
        const hasDetails =
          draftValues &&
          [
            "name",
            "phone",
            "email",
            "dob",
            "gender",
            "occupation",
            "address",
            "city",
            "state",
            "registrationNumber",
            "industry",
            "notesText",
          ].some((key) => String(draftValues[key] || "").trim());
        const hasProfile =
          d?.profile &&
          Object.keys(d.profile).some(
            (key) => !["sameAddress", "communicationChannels"].includes(key),
          );
        if (d && (hasDetails || hasProfile)) {
          reset(draftValues);
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
    if (embedded && (step < 4 || sectionIndex < sectionTitles.length - 1)) {
      await next();
      return;
    }
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
          : productParams.get("productCategory")
            ? "/products/new?" +
              query({
                clientId: result.data.id,
                category: productParams.get("productCategory"),
                definitionId: productParams.get("definitionId"),
              })
            : "/clients/" + result.data.id + "/success",
      );
    } catch (e) {
      if ((e as any).status === 409 && Array.isArray((e as any).details))
        setDuplicate(true);
    }
  });
  const validateSection = async () => {
    if (step === 0) {
      const values = form.getValues();
      const required: [keyof ClientInput, string][] = [
        ["name", "Full name"],
        ["phone", "Phone number"],
        ["email", "Email address"],
        ...(kind === "Individual"
          ? ([
              ["dob", "Date of birth"],
              ["gender", "Gender"],
              ["occupation", "Occupation"],
            ] as [keyof ClientInput, string][])
          : ([
              ["registrationNumber", "Registration number"],
              ["industry", "Industry"],
            ] as [keyof ClientInput, string][])),
      ];
      const missing = required.filter(
        ([key]) => !String(values[key] || "").trim(),
      );
      if (!(profile.communicationChannels || []).length)
        missing.push(["preferredContact", "Preferred contact method"]);
      const valid = await trigger(required.map(([key]) => key));
      if (missing.length) {
        missing.forEach(([key, label]) =>
          form.setError(key, {
            type: "required",
            message: `${label} is required.`,
          }),
        );
        setStepNotice(
          `Please fill in ${missing.map(([, label]) => label.toLowerCase()).join(", ")} before continuing.`,
        );
        form.setFocus(missing[0][0]);
        return false;
      }
      if (!valid) {
        setStepNotice(
          "Please correct the highlighted information before continuing.",
        );
        return false;
      }
    } else if (step < 4 && embedded) {
      const section =
        bodyRef.current?.querySelectorAll<HTMLElement>(".onboard-section")[
          sectionIndex
        ];
      const controls = Array.from(
        section?.querySelectorAll<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >(
          "input:not([type=hidden]):not([readonly]):not(:disabled), select:not(:disabled), textarea:not(:disabled)",
        ) || [],
      );
      const optional =
        section?.querySelector("h3")?.textContent === "Contact Restrictions";
      if (
        !optional &&
        controls.length &&
        !controls.some((control) =>
          control instanceof HTMLInputElement &&
          ["checkbox", "radio"].includes(control.type)
            ? control.checked
            : control.value.trim(),
        )
      ) {
        setStepNotice(
          `Fill in ${sectionTitles[sectionIndex]} before continuing.`,
        );
        controls[0].focus();
        return false;
      }
    }
    setStepNotice("");
    return true;
  };
  const next = async () => {
    if (!(await validateSection())) return;
    if (embedded && sectionIndex < sectionTitles.length - 1) {
      setSectionIndex(sectionIndex + 1);
      return;
    }
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
  if (id && existing.isPending) return <Loading layout="form" />;
  return (
    <div className="onboarding">
      {!embedded && <Back />}
      {!embedded && (
        <PageHeading
          title={id ? "Edit Client" : "Add New Client"}
          subtitle="Add client details to start managing their financial journey."
        />
      )}
      {recovered && (
        <div className="draft-notice">
          <span>Saved draft restored.</span>
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
              setProfile({
                sameAddress: true,
                communicationChannels: ["WhatsApp"],
              });
              setValue("preferredContact", "WhatsApp");
              setPhoto(undefined);
              setStep(0);
              setStepNotice("");
              setDuplicate(false);
              setDuplicateReason("");
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
            type="button"
            aria-current={step === i ? "step" : undefined}
            onClick={() => {
              if (i > step) {
                setStepNotice(
                  `Complete step ${step + 1}: ${steps[step]} first, then click Next.`,
                );
              } else if (i < step) {
                setStep(i);
              }
            }}
          >
            <span>{i + 1}</span>
            <small className="step-name">{s}</small>
          </button>
        ))}
      </div>
      {stepNotice && (
        <p className="step-notice" role="alert">
          {stepNotice}
        </p>
      )}
      <form onSubmit={submit}>
        {embedded && sectionTitles.length > 1 && (
          <label className="popup-section-selector">
            Section {sectionIndex + 1} of {sectionTitles.length}
            <select
              aria-label="Form section"
              value={sectionIndex}
              onChange={async (event) => {
                const target = Number(event.target.value);
                if (target > sectionIndex && !(await validateSection())) return;
                setSectionIndex(target);
              }}
            >
              {sectionTitles.map((title, index) => (
                <option key={index} value={index}>
                  {title}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="onboarding-form-body" ref={bodyRef}>
          <div className={`onboarding-layout step-${step}`}>
            <Panel className="onboarding-main">
              <div
                className="panel-heading"
                style={step === 4 ? { display: "none" } : undefined}
              >
                {step !== 0 && (
                  <div>
                    <h2>{steps[step]}</h2>
                    <p>
                      {step === 4
                        ? "Review the details below before saving."
                        : "Add the details you know. You can update the rest later."}
                    </p>
                  </div>
                )}
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
                    "Email Address *",
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
                      {field("dob", "Date of Birth *", "", "date")}
                      <fieldset>
                        <legend>Gender *</legend>
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
                      {field("occupation", "Occupation *", "Enter occupation")}
                    </>
                  ) : (
                    <>
                      {field(
                        "registrationNumber",
                        "Registration Number *",
                        "Company / GST registration",
                      )}
                      {field("industry", "Industry *", "Enter industry")}
                      <div className="muted">
                        Link existing contact people from the client profile
                        after saving.
                      </div>
                    </>
                  )}
                  <fieldset>
                    <legend>Preferred Contact Method *</legend>
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
                              const current =
                                profile.communicationChannels || [];
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
                        photoUrl={
                          photo ? URL.createObjectURL(photo) : undefined
                        }
                        animate="always"
                      />
                    </div>
                    <div>
                      <strong>Profile Photo</strong>
                      <button
                        type="button"
                        onClick={() => photoInput.current?.click()}
                      >
                        <Upload size={16} />{" "}
                        {photo ? photo.name : "Upload Photo"}
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
                    A client already shares this phone or email. Confirm this is
                    a distinct person, such as a family member.
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
        </div>
        <div className="form-footer">
          {onCancel ? (
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
          ) : (
            <Link className="button" to="/clients">
              Cancel
            </Link>
          )}
          <div>
            {(step > 0 || sectionIndex > 0) && (
              <button
                type="button"
                onClick={() => {
                  setStepNotice("");
                  if (embedded && sectionIndex > 0)
                    setSectionIndex(sectionIndex - 1);
                  else setStep(step - 1);
                }}
              >
                Back
              </button>
            )}
            {step < 4 ||
            (embedded && sectionIndex < sectionTitles.length - 1) ? (
              <button
                className="primary"
                type="button"
                onClick={() => void next()}
              >
                Next:{" "}
                {embedded && sectionIndex < sectionTitles.length - 1
                  ? sectionTitles[sectionIndex + 1]
                  : steps[step + 1]}{" "}
                <ChevronRight size={18} />
              </button>
            ) : (
              <Submit busy={write.isPending}>
                {id ? "Save Changes" : "Create Client"}
              </Submit>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
