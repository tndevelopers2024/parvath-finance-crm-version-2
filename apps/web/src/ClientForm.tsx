import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  Briefcase,
  ChevronRight,
  Mail,
  Phone,
  Upload,
  UserRound,
} from "lucide-react";
import {
  clientSchema,
  onboardingProfileSchema,
  withoutUnchanged,
  type ClientInput,
} from "../../../packages/contracts/src/index";
import { api, query, todayIST, useData, useWrite } from "./api";
import Clients from "./Clients";
import { ProductClients } from "./Supporting";
import {
  Avatar,
  Back,
  FormError,
  describeField,
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
  cleanProfile,
  type OnboardingProfile,
} from "./ClientOnboardingSections";
import DateField from "./DateField";
const steps = [
  "Basic Information",
  "Additional Details",
  "Financial Profile",
  "Preferences",
  "Review",
];
// Label and owning step for each value the client schema can reject; no step means the form has no control for it.
const fieldInfo: Record<string, [string, number?]> = {
  name: ["Name", 0],
  phone: ["Phone number", 0],
  email: ["Email address", 0],
  kind: ["Client type", 0],
  dob: ["Date of birth", 0],
  gender: ["Gender", 0],
  occupation: ["Occupation", 0],
  registrationNumber: ["Registration number", 0],
  industry: ["Industry", 0],
  address: ["Residential address", 1],
  city: ["City", 1],
  state: ["State", 1],
  source: ["Source", 1],
  annualIncome: ["Annual income range", 2],
  riskProfile: ["Risk profile", 2],
  preferredContact: ["Preferred contact method", 3],
  onboardingProfile: ["Additional details"],
  duplicateReason: ["Reason for shared contact details"],
  notesText: ["Notes"],
  tags: ["Tags"],
  version: ["Record version"],
};
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
    [reasonMissing, setReasonMissing] = useState(false),
    [recovered, setRecovered] = useState(false),
    [profile, setProfile] = useState<OnboardingProfile>({
      sameAddress: true,
      communicationChannels: ["WhatsApp"],
    });
  const bodyRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // Details already saved for this client are kept as they are; only values changed here are held to the current rules.
  const [savedProfile, setSavedProfile] = useState<
    Record<string, unknown> | undefined
  >();
  const [showProfileErrors, setShowProfileErrors] = useState(false);
  const [stepNotice, setStepNotice] = useState("");
  const [otherIssues, setOtherIssues] = useState<string[]>([]),
    [checkFollowup, setCheckFollowup] = useState(false);
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
    mode: "onTouched",
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
  // A field that is showing an error is checked again as it is edited, so the message goes as soon as it is fixed.
  useEffect(() => {
    const s = watch((_, { name }) => {
      if (name && form.getFieldState(name).error) void trigger(name);
    });
    return () => s.unsubscribe();
  }, [watch, trigger, form]);
  const errorCount = Object.keys(errors).length;
  useEffect(() => {
    if (!errorCount) setStepNotice("");
  }, [errorCount]);
  useEffect(() => {
    if (existing.data) {
      const c = existing.data.data;
      reset({
        ...c,
        dob: c.dob?.slice(0, 10) || "",
        registrationNumber: c.business?.registrationNumber || "",
        industry: c.business?.industry || "",
      });
      setSavedProfile(c.onboardingProfile || undefined);
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
  const issuesNotice =
    "Some details need correcting before this can be saved. See the list above the buttons.";
  const profileIssues = () =>
    onboardingProfileSchema.safeParse(
      withoutUnchanged(cleanProfile(profile), savedProfile),
    ).error?.issues || [];
  // Per-field messages for the open step, keyed like "dependents" or "children.0.dob"; they clear as values are fixed.
  const profileErrors: Record<string, string> = {};
  if (showProfileErrors)
    for (const issue of profileIssues())
      profileErrors[issue.path.join(".")] ??= issue.message;
  const checkDateInputs = () => {
    const invalid = Array.from(
      formRef.current?.querySelectorAll<HTMLInputElement>("input") || [],
    ).find((input) => input.validity.customError);
    if (!invalid) return true;
    setStepNotice(invalid.validationMessage);
    invalid.focus();
    invalid.reportValidity();
    return false;
  };
  const save = async (values: ClientInput) => {
    if (!checkDateInputs()) return;
    if (
      !id &&
      embedded &&
      (step < 4 || sectionIndex < sectionTitles.length - 1)
    ) {
      await next();
      return;
    }
    setOtherIssues([]);
    if (duplicate && duplicateReason.trim().length < 5) {
      setReasonMissing(true);
      return;
    }
    // The onboarding profile lives outside react-hook-form, so check it against the server's schema here.
    const sent = cleanProfile(profile);
    const checked = onboardingProfileSchema.safeParse(
      withoutUnchanged(sent, savedProfile),
    );
    if (!checked.success) {
      setShowProfileErrors(true);
      const followup = checked.error.issues.filter(
        (issue) => issue.path[0] === "initialFollowup",
      );
      const rest = checked.error.issues.filter(
        (issue) => issue.path[0] !== "initialFollowup",
      );
      if (followup.length) setCheckFollowup(true);
      setOtherIssues([
        ...(followup.length && id
          ? [`Initial follow-up: ${followup[0].message}.`]
          : []),
        ...rest.map(
          (issue) => `${describeField(issue.path)}: ${issue.message}`,
        ),
      ]);
      setStepNotice(
        followup.length && !id && !rest.length
          ? "Add a date and notes for the follow-up, or untick it."
          : issuesNotice,
      );
      return;
    }
    try {
      const result = await write.mutateAsync({
        path: id ? "/clients/" + id : "/clients",
        method: id ? "PATCH" : "POST",
        body: {
          ...values,
          onboardingProfile: sent,
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
      const details = (e as any).details;
      if ((e as any).status === 409 && Array.isArray(details))
        setDuplicate(true);
      // Zod failures arrive flattened; put each on its field so it is listed on whichever step is open.
      if ((e as any).status === 422 && details?.fieldErrors) {
        const unknown: string[] = [...(details.formErrors || [])];
        Object.entries<string[]>(details.fieldErrors).forEach(
          ([key, messages]) => {
            const message = messages?.[0] || "Check this value.";
            if (fieldInfo[key])
              form.setError(key as keyof ClientInput, {
                type: "server",
                message,
              });
            else unknown.push(`${describeField([key])}: ${message}`);
          },
        );
        setOtherIssues(unknown);
        if (!id && details.fieldErrors.onboardingProfile)
          setCheckFollowup(true);
        setStepNotice(issuesNotice);
      }
    }
  };
  // The second handler runs when the form's own schema check fails, possibly on a step that is not open.
  const submit = handleSubmit(save, () => setStepNotice(issuesNotice));
  // The server requires only a name and a phone number (clientSchema); everything else on this step is checked for format when filled in.
  const validateSection = async () => {
    if (!checkDateInputs()) return false;
    // Every detail section is checked before moving on; the follow-up is checked on the review screen.
    if (step >= 1 && step <= 3) {
      const found = profileIssues().filter(
        (issue) => issue.path[0] !== "initialFollowup",
      );
      if (found.length) {
        setShowProfileErrors(true);
        setStepNotice(
          `Check the highlighted details to continue: ${[
            ...new Set(found.map((issue) => describeField(issue.path))),
          ]
            .slice(0, 4)
            .join(", ")}.`,
        );
        return false;
      }
    }
    if (step === 0) {
      const values = form.getValues();
      const required: [keyof ClientInput, string][] = [
        ["name", kind === "Business" ? "Business name" : "Full name"],
        ["phone", "Phone number"],
      ];
      const missing = required.filter(
        ([key]) => !String(values[key] || "").trim(),
      );
      const valid = await trigger(
        [
          "name",
          "phone",
          "email",
          "dob",
          "gender",
          "occupation",
          "registrationNumber",
          "industry",
        ],
        { shouldFocus: true },
      );
      if (missing.length) {
        missing.forEach(([key, label]) =>
          form.setError(key, {
            type: "required",
            message: `Enter the ${label.toLowerCase()}.`,
          }),
        );
        setStepNotice(
          `Enter the ${missing.map(([, label]) => label.toLowerCase()).join(" and ")} to continue.`,
        );
        form.setFocus(missing[0][0]);
        return false;
      }
      if (!valid) {
        setStepNotice("Check the highlighted fields to continue.");
        return false;
      }
    }
    setStepNotice("");
    return true;
  };
  // Editing moves freely between steps; the guided checks apply to new clients only.
  const next = async () => {
    if (id) setStepNotice("");
    else if (!(await validateSection())) return;
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
        ) : (
          <Briefcase size={18} />
        )}
        <input
          type={type}
          aria-label={label}
          {...register(name as any)}
          placeholder={placeholder}
          aria-invalid={!!errors[name]}
          aria-describedby={errors[name] ? name + "-error" : undefined}
        />
      </span>
      {errors[name] && (
        <small className="field-error" id={name + "-error"}>
          {String(errors[name]?.message)}
        </small>
      )}
    </label>
  );
  const inline =
    step !== 0
      ? []
      : kind === "Business"
        ? ["name", "phone", "email", "registrationNumber", "industry"]
        : ["name", "phone", "email", "dob", "occupation"];
  // Problems the open step does not already show beside a field.
  const issues = Object.entries(errors)
    .filter(([key]) => !inline.includes(key))
    .map(([key, error]) => ({
      key,
      label: fieldInfo[key]?.[0] || key,
      target: fieldInfo[key]?.[1],
      message:
        typeof error?.message === "string"
          ? error.message
          : "Check this value.",
    }));
  const lastScreen =
    step === 4 && !(embedded && sectionIndex < sectionTitles.length - 1);
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
              setReasonMissing(false);
              setOtherIssues([]);
              setShowProfileErrors(false);
              setCheckFollowup(false);
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
              if (id) {
                setStep(i);
              } else if (i > step) {
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
      <form ref={formRef} onSubmit={submit} noValidate>
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
                      <label className="field">
                        Date of Birth
                        <span className="input-with-icon">
                          <Controller
                            control={form.control}
                            name="dob"
                            render={({ field: dob }) => (
                              <DateField
                                aria-label="Date of Birth"
                                value={dob.value || ""}
                                onChange={dob.onChange}
                                onBlur={dob.onBlur}
                                inputRef={dob.ref}
                                max={todayIST()}
                                error={errors.dob?.message}
                              />
                            )}
                          />
                        </span>
                      </label>
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
                        Link existing contact people from the client profile
                        after saving.
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
                  errors={profileErrors}
                  form={form}
                />
              ) : step === 2 ? (
                <FinancialProfile
                  profile={profile}
                  setProfile={setProfile}
                  errors={profileErrors}
                  form={form}
                />
              ) : step === 3 ? (
                <Preferences
                  profile={profile}
                  setProfile={setProfile}
                  errors={profileErrors}
                  form={form}
                />
              ) : (
                <ReviewSummary
                  profile={profile}
                  setProfile={setProfile}
                  form={form}
                  goTo={setStep}
                  editing={!!id}
                  checkFollowup={checkFollowup}
                />
              )}
              {!(write.error as any)?.details?.fieldErrors && (
                <FormError error={write.error} />
              )}
              {(issues.length > 0 || otherIssues.length > 0) && (
                <div role="alert" className="form-error">
                  <strong>Correct these before saving</strong>
                  {issues.map((issue) => (
                    <div key={issue.key}>
                      {issue.label}: {issue.message}{" "}
                      {issue.target !== undefined && issue.target !== step && (
                        <button
                          type="button"
                          className="text-link"
                          onClick={() => setStep(issue.target!)}
                        >
                          Go to {steps[issue.target]}
                        </button>
                      )}
                    </div>
                  ))}
                  {otherIssues.map((issue) => (
                    <div key={issue}>{issue}</div>
                  ))}
                </div>
              )}
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
                      aria-invalid={
                        reasonMissing && duplicateReason.trim().length < 5
                      }
                    />
                    {reasonMissing && duplicateReason.trim().length < 5 && (
                      <small className="field-error">
                        Add a short reason (at least 5 characters), for example
                        “Spouse uses the same number”.
                      </small>
                    )}
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
            {!lastScreen && (
              <button
                className={id ? undefined : "primary"}
                type="button"
                onClick={() => void next()}
              >
                {id
                  ? "Next"
                  : "Next: " +
                    (embedded && sectionIndex < sectionTitles.length - 1
                      ? sectionTitles[sectionIndex + 1]
                      : steps[step + 1])}{" "}
                <ChevronRight size={18} />
              </button>
            )}
            {(id || lastScreen) && (
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
