"""Browser regression checks for the public editing workspace."""
import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(os.environ.get("QA_OUTPUT", "/tmp/dcs-quality"))
OUT.mkdir(parents=True, exist_ok=True)
BASE = os.environ.get("QA_URL", "http://127.0.0.1:8765/")


def main():
    findings = []
    results = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        try:
            for width, height in [(1440, 900), (768, 1024), (390, 844), (320, 800)]:
                page = browser.new_page(viewport={"width": width, "height": height})
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                try:
                    page.goto(BASE, wait_until="networkidle", timeout=90000)
                    page.wait_for_function("Boolean(window.CanvasStudio && document.querySelector('#publicSlide'))")
                    page.locator("#shapeMenuButton").wait_for(state="visible")
                    page.screenshot(path=str(OUT / f"workspace-{width}.png"), full_page=True)
                    metrics = page.evaluate("""() => {
                      const rect = el => { const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}; };
                      const bar=document.querySelector('#editModeBar');
                      const tools=document.querySelector('.direct-tools');
                      const nav=document.querySelector('.public-edit-actions');
                      const shape=document.querySelector('#shapeMenuButton');
                      const range=document.createRange();range.selectNodeContents(shape);
                      const sr=shape.getBoundingClientRect(), tr=range.getBoundingClientRect();
                      const a=tools.getBoundingClientRect(),b=nav.getBoundingClientRect();
                      const overlap=Math.min(a.right,b.right)>Math.max(a.left,b.left)+1 && Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)+1;
                      return {title:document.title,viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,
                        bar:rect(bar),tools:rect(tools),navigation:rect(nav),shape:rect(shape),
                        shapeLabel:{left:tr.left,right:tr.right},overlap,
                        labelContained:tr.left>=sr.left-1 && tr.right<=sr.right+1,
                        visibleControls:[...bar.querySelectorAll('button,select')].filter(e=>e.getClientRects().length).map(e=>({id:e.id||e.dataset.tool,...rect(e)}))};
                    }""")
                    failures = []
                    if metrics["documentWidth"] > width + 1:
                        failures.append("page has horizontal overflow")
                    if metrics["overlap"]:
                        failures.append("editing tools overlap slide navigation")
                    if not metrics["labelContained"]:
                        failures.append("Shapes label extends beyond its button")
                    if errors:
                        failures.append("page errors: " + "; ".join(errors))
                    metrics["failures"] = failures
                    results.append(metrics)
                    findings.extend(f"{width}px: {failure}" for failure in failures)
                except Exception as error:
                    findings.append(f"{width}px: {type(error).__name__}: {error}")
                    page.screenshot(path=str(OUT / f"error-{width}.png"), full_page=True)
                finally:
                    page.close()
        finally:
            browser.close()
    report = {"url": BASE, "results": results, "findings": findings}
    (OUT / "browser-results.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if findings:
        raise AssertionError("\n".join(findings))


if __name__ == "__main__":
    main()
