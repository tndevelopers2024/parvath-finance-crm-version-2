import CatalogueWorkspace from "./CatalogueWorkspace";
import { useState } from "react";
import { Plus } from "lucide-react";
import { useWrite } from "./api";
import {
  FormError,
  Modal,
  PageHeading,
  Submit,
  useAuth,
  useToast,
} from "./components";
export default function Providers() {
  const user = useAuth(),
    write = useWrite(),
    toast = useToast();
  const [adding, setAdding] = useState(false);
  return (
    <>
      <PageHeading
        title="Providers"
        subtitle="Manage insurance companies, lenders, and investment providers separately from their product plans."
        actions={
          user.role === "Administrator" && (
            <button className="button primary" onClick={() => setAdding(true)}>
              <Plus size={16} />
              Add provider
            </button>
          )
        }
      />
      <CatalogueWorkspace mode="providers" />
      {adding && (
        <Modal title="Add provider" onClose={() => setAdding(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const body = Object.fromEntries(new FormData(e.currentTarget));
              try {
                await write.mutateAsync({ path: "/providers", body });
                toast("Provider added");
                setAdding(false);
              } catch {
                /* FormError renders error */
              }
            }}
          >
            <label>
              Provider name *
              <input
                name="name"
                required
                minLength={2}
                maxLength={100}
                placeholder="Insurance company, bank or investment provider"
              />
            </label>
            <FormError error={write.error} />
            <Submit busy={write.isPending}>Save provider</Submit>
          </form>
        </Modal>
      )}
    </>
  );
}
