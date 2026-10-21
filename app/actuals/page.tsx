import { currentUser } from "../../lib/auth";
import { money } from "../../lib/money";
import { getYear, years } from "../../lib/year";
import YearNav from "../../components/YearNav";
import { addActual, deleteActual } from "./actions";

export default async function Actuals({
  searchParams,
}: {
  searchParams: { year?: string };
}) {
  const { db, profile } = await currentUser();
  const fy = await getYear(searchParams.year);
  const ys = await years();

  const [{ data: actuals }, { data: glCodes }] = await Promise.all([
    db
      .from("actuals")
      .select("*,gl_codes(description)")
      .eq("financial_year_id", fy.id)
      .order("date", { ascending: false }),
    db.from("gl_codes").select("*").order("code"),
  ]);

  const canWrite =
    ["admin", "treasurer"].includes(profile?.role) && fy.status === "open";

  return (
    <>
      <section className="pageHeader">
        <div>
          <div className="eyebrow">ACCOUNTING</div>
          <h1>Actuals</h1>
          <p>
            {fy.label} · {actuals?.length || 0} recorded entries
          </p>
        </div>
        <div className="headerTools">
          <span
            className={
              "status " +
              (fy.status === "open" ? "statusOpen" : "statusClosed")
            }
          >
            {fy.status}
          </span>
          <YearNav years={ys} current={fy.label} path="/actuals" />
        </div>
      </section>

      {canWrite && (
        <section className="panel">
          <div className="panelHead">
            <div>
              <div className="eyebrow">NEW ENTRY</div>
              <h2>Add actual</h2>
            </div>
          </div>

          <form action={addActual} className="formgrid">
            <input
              type="hidden"
              name="financial_year_id"
              value={fy.id}
            />

            <input
              name="date"
              type="date"
              min={fy.start_date}
              max={fy.end_date}
              required
              aria-label="Date"
            />

            <select name="gl_code" required aria-label="GL code">
              <option value="">Select GL code</option>
              {glCodes?.map((gl) => (
                <option key={gl.code} value={gl.code}>
                  {gl.code} — {gl.description}
                </option>
              ))}
            </select>

            <input
              name="amount"
              type="number"
              step="0.01"
              placeholder="Amount"
              required
            />

            <input
              name="description"
              placeholder="Description"
            />

            <input
              name="school_month"
              type="number"
              min="1"
              max="12"
              placeholder="School month"
            />

            <button type="submit">Add actual</button>
          </form>
        </section>
      )}

      <section className="panel">
        <div className="panelHead">
          <div>
            <div className="eyebrow">ACTUAL DETAIL</div>
            <h2>Recorded actuals</h2>
          </div>
        </div>

        {!actuals?.length ? (
          <p className="muted">
            No actual entries have been recorded for {fy.label}.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>GL</th>
                <th>Description</th>
                <th>Amount</th>
                {canWrite && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {actuals.map((actual: any) => (
                <tr key={actual.id}>
                  <td>{actual.date}</td>
                  <td>
                    {actual.gl_code}
                    {actual.gl_codes?.description
                      ? " · " + actual.gl_codes.description
                      : ""}
                  </td>
                  <td>{actual.description || "—"}</td>
                  <td>{money(actual.amount)}</td>
                  {canWrite && (
                    <td>
                      <form action={deleteActual}>
                        <input
                          type="hidden"
                          name="id"
                          value={actual.id}
                        />
                        <input
                          type="hidden"
                          name="financial_year_id"
                          value={fy.id}
                        />
                        <button
                          type="submit"
                          className="linkbutton"
                        >
                          Delete
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
