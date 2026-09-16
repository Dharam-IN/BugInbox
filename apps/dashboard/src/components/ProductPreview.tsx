/**
 * Illustrative preview of the reporter's widget and the owner's inbox.
 *
 * This is a static mock built from the same design tokens as the real
 * interface, not a live view of anyone's data. It is labelled as an example in
 * the visible caption so nobody can mistake it for real reports.
 */
export function ProductPreview() {
  return (
    <div className="preview-wrap">
      <figure className="preview-frame" style={{ margin: 0 }}>
        <figcaption className="preview-caption">
          <span>What a reporter fills in, and what you see afterwards</span>
          <span className="example-tag">Example — illustrative, not real reports</span>
        </figcaption>

        <div className="preview-split">
          <div className="preview-pane">
            <p className="preview-pane-title">On your website</p>
            <div className="mock-page">
              <div className="mock-stack" aria-hidden="true">
                <span className="mock-bar short" />
                <span className="mock-bar wide" />
                <span className="mock-bar medium" />
              </div>

              <div className="mock-widget">
                <div className="mock-widget-head">
                  <div>
                    <strong>Report a problem</strong>
                    <br />
                    <span>Tell the site owner what went wrong.</span>
                  </div>
                </div>
                <div className="mock-field tall">
                  The pricing cards overlap the footer when I make the window narrow.
                </div>
                <div className="mock-field">sam@example.com</div>
                <div className="mock-attachment">
                  <span className="mock-thumb" aria-hidden="true" />
                  <span>screenshot.png · attached by the reporter</span>
                </div>
                <div className="mock-submit">Send report</div>
              </div>
            </div>
          </div>

          <div className="preview-pane">
            <p className="preview-pane-title">In your inbox</p>
            <div className="mock-filters" aria-hidden="true">
              <span className="mock-filter is-active">All</span>
              <span className="mock-filter">New</span>
              <span className="mock-filter">In progress</span>
              <span className="mock-filter">Resolved</span>
            </div>

            <div className="mock-inbox">
              <article className="mock-report is-selected">
                <div className="mock-report-top">
                  <p>The pricing cards overlap the footer when I make the window narrow.</p>
                  <span className="badge new">New</span>
                </div>
                <p className="mock-report-meta">
                  example.com/pricing · 390 × 780 · screenshot · contact given
                </p>
              </article>

              <article className="mock-report">
                <div className="mock-report-top">
                  <p>Clicking “Start free trial” does nothing the second time.</p>
                  <span className="badge in_progress">In progress</span>
                </div>
                <p className="mock-report-meta">example.com/signup · 1440 × 900</p>
              </article>

              <article className="mock-report">
                <div className="mock-report-top">
                  <p>Typo on the about page: “recieve” should be “receive”.</p>
                  <span className="badge resolved">Resolved</span>
                </div>
                <p className="mock-report-meta">example.com/about · 1280 × 800 · contact given</p>
              </article>
            </div>
          </div>
        </div>
      </figure>
    </div>
  );
}
