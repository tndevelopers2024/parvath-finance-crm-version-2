import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle, Download, Upload } from "lucide-react";
import { useWrite } from "./api";
import { Back, Badge, FormError, PageHeading, Panel } from "./components";
export default function ImportClients() {
  const write = useWrite(),
    [preview, setPreview] = useState<any>(),
    [result, setResult] = useState<any>(),
    [state, setState] = useState(""),
    [error, setError] = useState("");
  // Commits in server-side chunks: keeps calling until the job completes, or stops when a chunk fails
  // (earlier chunks stay saved and the same button resumes without duplicating).
  const commit = async () => {
    setError("");
    try {
      for (;;) {
        const r = await write.mutateAsync({
          path: `/clients/import/${preview.id}/commit`,
        });
        setResult(r.data.result);
        setState(r.data.state);
        if (r.data.state !== "Partial") break;
      }
    } catch {
      /* Error rendered below */
    }
  };
  return (
    <>
      <Back />
      <PageHeading
        title="Import Clients"
        subtitle="Preview every row before adding contacts to your workspace."
      />
      <Panel
        title="1. Prepare your file"
        action={
          <a className="button" href="/api/clients/template">
            <Download size={17} />
            Download template
          </a>
        }
      >
        <p>
          CSV columns: name, phone, email, kind, city, state, source. Name and
          phone are required (Indian mobiles start with 6-9). kind (default
          Individual) must be Individual or Business; date of birth may be
          YYYY-MM-DD or DD-MM-YYYY. Maximum 500
          rows / 1 MB. Duplicate contacts are skipped, never overwritten.
        </p>
        <label className="upload-zone">
          <Upload size={28} />
          <strong>Choose a clients CSV</strong>
          <input
            aria-label="Clients CSV"
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const input = e.target;
              const f = input.files?.[0];
              // Reset so choosing the same file name again (after fixing it) fires a change event.
              const reset = () => {
                input.value = "";
              };
              if (!f) return;
              if (!f.name.toLowerCase().endsWith(".csv") || f.size > 1000000) {
                reset();
                setError("Choose a CSV smaller than 1 MB");
                return;
              }
              setError("");
              try {
                const r = await write.mutateAsync({
                  path: "/clients/import/preview",
                  body: { csv: await f.text() },
                });
                setPreview(r.data);
                setResult(null);
                setState("");
              } catch {
                /* Error rendered below */
              } finally {
                reset();
              }
            }}
          />
        </label>
        <FormError error={error ? new Error(error) : write.error} />
      </Panel>
      {preview && state !== "Completed" && (
        <Panel
          title="2. Review import"
          action={
            <button
              className="primary"
              disabled={
                write.isPending || !preview.rows.some((r: any) => !r.error)
              }
              onClick={commit}
            >
              {state === "Failed" || state === "Partial"
                ? "Resume import"
                : `Import ${preview.rows.filter((r: any) => !r.error).length} valid rows`}
            </button>
          }
        >
          {result && state !== "Completed" && (
            <p className={state === "Failed" ? "field-error" : undefined}>
              {state === "Failed"
                ? `Import stopped after ${result.processed} of ${result.total} rows. ${result.created} clients were saved; resume to continue without duplicates. `
                : `Importing: ${result.processed} of ${result.total} rows processed, ${result.created} clients added. `}
              {result.skipped + result.failed > 0 &&
                `${result.skipped + result.failed} rows skipped so far.`}
            </p>
          )}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Validation</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r: any) => (
                  <tr key={r.row}>
                    <td>{r.row}</td>
                    <td>{r.data.name}</td>
                    <td>{r.data.phone}</td>
                    <td>{r.data.email}</td>
                    <td>
                      {r.error ? (
                        <span className="field-error">{r.error}</span>
                      ) : (
                        <Badge tone="mint">Ready</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      {result && state === "Completed" && (
        <Panel title="Import complete">
          <CheckCircle className="text-teal-700" size={40} />
          <h2>
            {result.created} clients added · {result.skipped + (result.failed || 0)} rows
            skipped
          </h2>
          {result.errors.map((e: any) => (
            <p key={e.row}>
              Row {e.row}: {e.error}
            </p>
          ))}
          <Link className="button primary" to="/clients">
            View Clients
          </Link>
        </Panel>
      )}
    </>
  );
}
