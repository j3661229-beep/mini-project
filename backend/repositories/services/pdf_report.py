"""PDF rendering for the GitPulse risk report."""

from __future__ import annotations

from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def build_risk_report_pdf(payload: dict) -> bytes:
    """Create a paginated PDF from the same JSON-safe risk report payload."""
    buffer = BytesIO()
    document = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=16 * mm, bottomMargin=16 * mm)
    styles = getSampleStyleSheet()
    title = ParagraphStyle("GitPulseTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=22, leading=26, textColor=colors.HexColor("#B9142B"), spaceAfter=5)
    section = ParagraphStyle("GitPulseSection", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=13, leading=17, textColor=colors.HexColor("#221B1C"), spaceBefore=14, spaceAfter=7)
    body = ParagraphStyle("GitPulseBody", parent=styles["BodyText"], fontSize=9, leading=13, textColor=colors.HexColor("#3B3435"))
    subtle = ParagraphStyle("GitPulseSubtle", parent=body, textColor=colors.HexColor("#766D6E"))
    story = []
    repo = payload["repository"]
    summary = payload["summary"]
    story += [Paragraph("GitPulse", title), Paragraph("Repository intelligence report", styles["BodyText"]), Spacer(1, 5 * mm)]
    metadata = [
        ["Repository", f'{repo["owner"]}/{repo["name"]}'],
        ["URL", repo["github_url"]],
        ["Analysis status", repo["analysis_status"]],
        ["Last analysis", str(repo["last_ingested_at"] or "Data not available for this repository.")],
    ]
    story.append(_table(metadata, [42 * mm, 132 * mm]))
    story.append(Paragraph("Repository summary", section))
    story.append(_table([
        ["Commits", str(summary["commit_count"])], ["Contributors", str(summary["contributor_count"])],
        ["Pull requests", str(summary["pull_request_count"])], ["At-risk files", str(summary["at_risk_file_count"])],
        ["Review bottlenecks", str(summary["bottleneck_count"])],
    ], [55 * mm, 40 * mm]))
    activity = payload.get("activity", {})
    story.append(Paragraph("Contributor activity", section))
    if activity.get("total_commits"):
        story.append(Paragraph(f'{activity["total_commits"]} commits across {activity["active_days"]} active days in the available {activity["days"]}-day window. Peak daily activity: {activity["peak_commits"]} commits.', body))
        rows = [["Contributor", "Commits"]] + [[row["author_name"], str(row["commits"])] for row in activity.get("contributors", [])]
        story.append(Spacer(1, 3 * mm)); story.append(_table(rows, [100 * mm, 35 * mm], header=True))
    else:
        story.append(Paragraph("Data not available for this repository.", subtle))
    story.append(Paragraph("Directory ownership", section))
    directories = payload.get("directory_ownership", [])
    if directories:
        rows = [["Directory", "Owner", "Ownership", "Contributors", "Bus factor", "Churn", "Risk"]]
        for row in directories[:30]:
            rows.append([row["directory"], row["top_contributor"], f'{row["top_contributor_share"] * 100:.0f}%', str(row["contributor_count"]), str(row["bus_factor"]), str(row["total_churn"]), "High" if row["bus_factor_risk"] else "Normal"])
        story.append(_table(rows, [38 * mm, 28 * mm, 18 * mm, 21 * mm, 19 * mm, 18 * mm, 16 * mm], header=True, small=True))
    else:
        story.append(Paragraph("Data not available for this repository.", subtle))
    story.append(Paragraph("File ownership and bus-factor risk", section))
    ownership = payload.get("file_ownership", [])
    if ownership:
        rows = [["File", "Top owner", "Ownership", "Churn", "Risk"]]
        for row in ownership[:35]:
            rows.append([row["file_path"], row["top_contributor"], f'{row["top_contributor_share"] * 100:.0f}%', str(row["total_churn"]), "High" if row["bus_factor_risk"] else "Normal"])
        story.append(_table(rows, [70 * mm, 31 * mm, 20 * mm, 19 * mm, 18 * mm], header=True, small=True))
    else:
        story.append(Paragraph("Data not available for this repository.", subtle))
    story.append(Paragraph("Review collaboration", section))
    bottlenecks = [row for row in payload.get("review_bottlenecks", []) if row["is_bottleneck"]]
    if bottlenecks:
        rows = [["Reviewer", "Reviews given", "Reviews received"]] + [[row["login"], str(row["in_degree"]), str(row["out_degree"])] for row in bottlenecks]
        story.append(_table(rows, [70 * mm, 35 * mm, 35 * mm], header=True))
    else:
        story.append(Paragraph("No review bottlenecks were identified from available review data.", subtle))
    story.append(Paragraph("Interpretation", section))
    story.append(Paragraph("High ownership concentration indicates that a small number of contributors account for most recorded file churn. It is a knowledge-distribution signal, not a defect or personnel assessment.", body))
    document.build(story, onFirstPage=_page_number, onLaterPages=_page_number)
    return buffer.getvalue()


def _table(rows, widths, header=False, small=False):
    table = Table(rows, colWidths=widths, repeatRows=1 if header else 0)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#241C1D") if header else colors.white),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white if header else colors.HexColor("#3B3435")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold" if header else "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 7 if small else 8),
        ("LEADING", (0, 0), (-1, -1), 9 if small else 11),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#D8D0D0")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return table


def _page_number(canvas, document):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#766D6E"))
    canvas.drawString(16 * mm, 10 * mm, "GitPulse repository intelligence report")
    canvas.drawRightString(A4[0] - 16 * mm, 10 * mm, f"Page {document.page}")
    canvas.restoreState()