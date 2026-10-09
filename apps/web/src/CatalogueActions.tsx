import { useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, useData, useWrite } from "./api";
import {
  Modal,
  FormError,
  Submit,
  Loading,
  ErrorState,
  useToast,
} from "./components";

export default function CatalogueActions({
  record,
  type,
}: {
  record: any;
  type: "providers" | "catalogue";
}) {
  const [action, setAction] = useState<"edit" | "delete" | null>(null);
  const providers = useData(
    "/providers",
    action === "edit" && type === "catalogue",
  );
  const usage = useData(
    type === "catalogue" ? "/products/summary" : "/catalogue",
    action === "delete",
  );
  const linkedCount =
    type === "catalogue"
      ? usage.data?.products?.find(
          (plan: any) => plan.definitionId === record.id,
        )?.records || 0
      : usage.data?.data?.filter((plan: any) => plan.providerId === record.id)
          .length || 0;
  const write = useWrite();
  const blocked =
    action === "delete" &&
    (linkedCount > 0 ||
      (write.error instanceof ApiError && write.error.status === 409));
  const toast = useToast();
  const label = type === "providers" ? "provider" : "product plan";
  const close = () => {
    setAction(null);
    write.reset();
  };
  return (
    <>
      <button
        className="button"
        onClick={() => {
          write.reset();
          setAction("edit");
        }}
        aria-label={`Edit ${record.name}`}
      >
        Edit
      </button>
      <button
        className="button"
        onClick={() => {
          write.reset();
          setAction("delete");
        }}
        aria-label={`Delete ${record.name}`}
      >
        Delete
      </button>
      {action && (
        <Modal
          className="catalogue-action-modal"
          title={`${action === "edit" ? "Edit" : "Delete"} ${label}`}
          onClose={close}
        >
          {action === "delete" && usage.isPending ? (
            <Loading />
          ) : action === "delete" && usage.error ? (
            <ErrorState error={usage.error} retry={usage.refetch} />
          ) : blocked ? (
            <div className="catalogue-delete-notice">
              <p className="catalogue-delete-name">
                <strong>{record.name} is in use</strong>
              </p>
              <p>
                {type === "catalogue"
                  ? `This plan has ${linkedCount || "existing"} linked client ${linkedCount === 1 ? "record" : "records"}. It cannot be deleted because those policies, accounts and applications need its product details.`
                  : `This provider has ${linkedCount || "existing"} product ${linkedCount === 1 ? "plan" : "plans"}. Remove its plans before deleting the provider.`}
              </p>
              <div className="catalogue-delete-guidance">
                <strong>What to do next</strong>
                <p>
                  {type === "catalogue"
                    ? "Review the linked records with your administrator. They must be moved to another plan or removed before deletion. The app does not currently support these actions."
                    : "Review this provider’s plans. Only plans with no linked client records can be deleted."}
                </p>
              </div>
              <div className="catalogue-delete-buttons">
                <button className="button" type="button" onClick={close}>
                  Close
                </button>
                {type === "catalogue" && (
                  <Link
                    className="button primary"
                    to={`/products/category/${encodeURIComponent(record.category)}?definitionId=${record.id}`}
                    onClick={close}
                  >
                    View linked records
                  </Link>
                )}
              </div>
            </div>
          ) : action === "edit" &&
            type === "catalogue" &&
            providers.isPending ? (
            <Loading />
          ) : action === "edit" && type === "catalogue" && providers.error ? (
            <ErrorState error={providers.error} retry={providers.refetch} />
          ) : (
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (
                  action === "delete" &&
                  (usage.isPending || usage.error || blocked)
                )
                  return;
                const body = Object.fromEntries(
                  new FormData(event.currentTarget),
                );
                try {
                  await write.mutateAsync({
                    path: `/${type}/${record.id}`,
                    method: action === "edit" ? "PATCH" : "DELETE",
                    body,
                  });
                  toast(
                    `${label === "provider" ? "Provider" : "Product plan"} ${action === "edit" ? "updated" : "deleted"}`,
                  );
                  close();
                } catch {
                  /* FormError displays the server error. */
                }
              }}
            >
              {action === "delete" ? (
                <p>
                  Delete {record.name}?{" "}
                  {type === "providers"
                    ? "Providers with product plans cannot be deleted."
                    : "Plans linked to client records cannot be deleted."}
                </p>
              ) : (
                <div className="form-grid">
                  <label>
                    Name *
                    <input
                      name="name"
                      required
                      minLength={2}
                      maxLength={100}
                      defaultValue={record.name}
                    />
                  </label>
                  {type === "catalogue" && (
                    <>
                      <label>
                        Provider *
                        <select
                          name="providerId"
                          required
                          defaultValue={record.providerId}
                        >
                          {providers.data?.data.map((p: any) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Category *
                        <select name="category" defaultValue={record.category}>
                          {[
                            "Life Insurance",
                            "Health Insurance",
                            "Vehicle Insurance",
                            "Home Loan",
                            "Business Loan",
                            "Investment",
                            "Term Insurance",
                          ].map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}
                </div>
              )}
              <FormError error={write.error} />
              <Submit busy={write.isPending}>
                {action === "edit" ? "Save changes" : `Delete ${label}`}
              </Submit>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
