from django.core.mail import EmailMultiAlternatives
from django.conf import settings


def send_execution_report(execution, recipient: str) -> None:
    """
    Send a clean, readable execution report email.
    No raw logs — just the facts the user and their client care about.
    """
    etl = execution.etl
    is_success = execution.status == "SUCCESS"

    output_files = list(execution.output_files.all())

    duration = _format_duration(execution)

    friendly_error = None
    if not is_success and execution.error_message:
        msg = execution.error_message
        if len(msg) > 600:
            msg = msg[:600] + "\n...(full details available in the app)"
        friendly_error = msg

    subject = (
        f"{'✓' if is_success else '✗'} "
        f"{execution.execution_label or etl.name} — {execution.status}"
    )

    html_body = _build_html(execution, etl, is_success, output_files, duration, friendly_error)
    text_body = _build_text(execution, etl, is_success, output_files, duration, friendly_error)

    msg = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@etl-platform.com"),
        to=[recipient],
    )
    msg.attach_alternative(html_body, "text/html")
    msg.send()


def _format_duration(execution) -> str:
    if not execution.started_at or not execution.completed_at:
        return "—"
    secs = int((execution.completed_at - execution.started_at).total_seconds())
    if secs < 60:
        return f"{secs}s"
    return f"{secs // 60}m {secs % 60}s"


def _build_text(execution, etl, is_success, output_files, duration, friendly_error) -> str:
    lines = [
        "ETL Execution Report",
        "=" * 40,
        f"ETL:      {etl.name} v{etl.version}",
        f"Run:      {execution.execution_label or etl.name}",
        f"Status:   {execution.status}",
        f"By:       {execution.launched_by.username if execution.launched_by else '—'}",
        f"Duration: {duration}",
        "",
    ]

    if execution.started_at:
        lines.append(f"Started:  {execution.started_at.strftime('%Y-%m-%d %H:%M UTC')}")
    if execution.completed_at:
        lines.append(f"Finished: {execution.completed_at.strftime('%Y-%m-%d %H:%M UTC')}")

    if execution.config_overrides:
        lines += ["", "Configuration changes for this run:"]
        for k, v in execution.config_overrides.items():
            lines.append(f"  {k}: {v}")

    if output_files:
        lines += ["", f"Output files ({len(output_files)}):"]
        for f in output_files:
            lines.append(f"  - {f.filename}  ({f.file_size_mb} MB)")
        app_url = getattr(settings, "FRONTEND_URL", "http://localhost:3000")
        lines += ["", f"Download: {app_url}"]

    if friendly_error:
        lines += ["", "What went wrong:", friendly_error]

    lines += [
        "",
        "─" * 40,
        "Full logs and outputs available in the ETL platform.",
    ]
    return "\n".join(lines)


def _build_html(execution, etl, is_success, output_files, duration, friendly_error) -> str:
    status_color = "#16a34a" if is_success else "#dc2626"
    status_bg = "#f0fdf4" if is_success else "#fef2f2"
    status_border = "#86efac" if is_success else "#fca5a5"
    icon = "✓" if is_success else "✗"
    app_url = getattr(settings, "FRONTEND_URL", "http://localhost:3000")

    launched_by = execution.launched_by.username if execution.launched_by else "—"
    started = execution.started_at.strftime("%d %b %Y %H:%M UTC") if execution.started_at else "—"
    finished = execution.completed_at.strftime("%d %b %Y %H:%M UTC") if execution.completed_at else "—"

    # Config overrides section
    overrides_html = ""
    if execution.config_overrides:
        rows = "".join(
            f'<tr><td style="padding:6px 12px;color:#64748b;font-size:13px;">{k}</td>'
            f'<td style="padding:6px 12px;color:#0f172a;font-size:13px;font-weight:500;">{v}</td></tr>'
            for k, v in execution.config_overrides.items()
        )
        overrides_html = f"""
        <p style="font-size:11px;font-weight:700;text-transform:uppercase;
                  letter-spacing:.06em;color:#94a3b8;margin:24px 0 8px;">
          Configuration changes for this run
        </p>
        <table style="width:100%;border-collapse:collapse;background:#f8fafc;
                      border-radius:8px;overflow:hidden;">
          {rows}
        </table>"""

    # Output files section
    outputs_html = ""
    if output_files:
        file_rows = "".join(
            f'<tr><td style="padding:8px 12px;font-size:13px;font-weight:600;color:#0f172a;">'
            f'{f.filename}</td>'
            f'<td style="padding:8px 12px;font-size:12px;color:#94a3b8;text-align:right;">'
            f'{f.file_size_mb} MB</td></tr>'
            for f in output_files
        )
        outputs_html = f"""
        <p style="font-size:11px;font-weight:700;text-transform:uppercase;
                  letter-spacing:.06em;color:#94a3b8;margin:24px 0 8px;">
          {len(output_files)} output file{'s' if len(output_files) != 1 else ''}
        </p>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
          {file_rows}
        </table>
        <a href="{app_url}"
           style="display:block;margin-top:16px;padding:12px;background:#2563eb;
                  color:#fff;text-align:center;text-decoration:none;border-radius:8px;
                  font-weight:600;font-size:14px;">
          Download files in the app
        </a>"""

    # Error section
    error_html = ""
    if friendly_error:
        error_html = f"""
        <p style="font-size:11px;font-weight:700;text-transform:uppercase;
                  letter-spacing:.06em;color:#94a3b8;margin:24px 0 8px;">
          What went wrong
        </p>
        <pre style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;
                    padding:12px;font-size:12px;color:#991b1b;
                    white-space:pre-wrap;word-break:break-all;margin:0;">{friendly_error}</pre>"""

    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
             background:#f8fafc;margin:0;padding:20px;color:#1e293b;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;
              overflow:hidden;border:1px solid #e2e8f0;">

    <div style="padding:24px;background:{status_bg};border-bottom:1px solid {status_border};">
      <span style="display:inline-block;padding:4px 12px;border-radius:99px;
                   font-size:13px;font-weight:600;background:{status_color};
                   color:#fff;margin-bottom:10px;">{icon} {execution.status}</span>
      <p style="font-size:20px;font-weight:700;margin:0 0 4px;color:#0f172a;">
        {etl.name}
      </p>
      <p style="font-size:14px;color:#64748b;margin:0;">
        {execution.execution_label or etl.name}
      </p>
    </div>

    <div style="padding:24px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:8px 0;font-size:13px;color:#64748b;">Launched by</td>
          <td style="padding:8px 0;font-size:13px;font-weight:500;text-align:right;">{launched_by}</td>
        </tr>
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:8px 0;font-size:13px;color:#64748b;">Started</td>
          <td style="padding:8px 0;font-size:13px;font-weight:500;text-align:right;">{started}</td>
        </tr>
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:8px 0;font-size:13px;color:#64748b;">Finished</td>
          <td style="padding:8px 0;font-size:13px;font-weight:500;text-align:right;">{finished}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-size:13px;color:#64748b;">Duration</td>
          <td style="padding:8px 0;font-size:13px;font-weight:500;text-align:right;">{duration}</td>
        </tr>
      </table>

      {overrides_html}
      {outputs_html}
      {error_html}
    </div>

    <div style="padding:16px 24px;font-size:11px;color:#94a3b8;text-align:center;
                border-top:1px solid #f1f5f9;">
      Full logs and outputs are available in the ETL platform.
    </div>
  </div>
</body>
</html>"""