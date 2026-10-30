import CatalogueWorkspace from "./CatalogueWorkspace";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { productCategories } from "../../../packages/contracts/src/index";
import { useData, useWrite } from "./api";
import {
  PageHeading,
  Modal,
  Submit,
  FormError,
  Loading,
  ErrorState,
  useAuth,
  useToast,
} from "./components";
const categories = productCategories.map((name) => [name] as const);
export const productCategoryPath = (category: string) =>
  "/products/category/" + encodeURIComponent(category);
export default function Products() {
  const providers = useData("/providers");
  const catalogue = useData("/catalogue"),
    summary = useData("/products/summary");
  const user = useAuth(),
    write = useWrite(),
    toast = useToast();
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState(false);
  const close = () => {
    setAdding(false);
    setParams({});
  };
  if (catalogue.isPending || summary.isPending) return <Loading />;
  if (catalogue.error || summary.error)
    return <ErrorState error={(catalogue.error || summary.error)!} />;
  return (
    <div className="product-catalogue-page">
      <PageHeading
        title="Products"
        subtitle="Manage your product catalogue and track client policies and applications."
        actions={
          user.role === "Administrator" && (
            <button className="button primary" onClick={() => setAdding(true)}>
              <Plus size={16} />
              Add product
            </button>
          )
        }
      />
      <CatalogueWorkspace mode="products" />
      <Link className="text-link" to="/products/records">
        View all client policies & accounts
      </Link>
      {(adding || params.has("setup") || params.has("addProduct")) && (
        <Modal title="Add product" onClose={close}>
          {providers.isPending ? (
            <Loading />
          ) : providers.error ? (
            <ErrorState error={providers.error} retry={providers.refetch} />
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const body = Object.fromEntries(new FormData(e.currentTarget));
                try {
                  await write.mutateAsync({ path: "/catalogue", body });
                  toast("Product added");
                  close();
                } catch {
                  /* FormError renders server error */
                }
              }}
            >
              <p className="muted">
                Add a provider’s plan so clients can be linked to it.
              </p>
              <div className="form-grid">
                <label>
                  Product name *
                  <input
                    name="name"
                    required
                    minLength={2}
                    maxLength={100}
                    placeholder="e.g. Family Health Cover"
                  />
                </label>
                <label>
                  Provider *
                  <select
                    name="providerId"
                    required
                    defaultValue={params.get("providerId") || ""}
                  >
                    <option value="">Select an existing provider</option>
                    {providers.data?.data.map((provider: any) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </select>
                  <Link className="text-link" to="/providers">
                    Manage providers / add a provider
                  </Link>
                </label>
                <label>
                  Category *
                  <select
                    name="category"
                    defaultValue={params.get("setup") || categories[0][0]}
                  >
                    {categories.map(([name]) => (
                      <option key={name}>{name}</option>
                    ))}
                  </select>
                </label>
              </div>
              <FormError error={write.error} />
              <Submit busy={write.isPending}>Save product</Submit>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
