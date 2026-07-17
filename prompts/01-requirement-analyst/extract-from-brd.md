Mode: BRD — single section

You are processing ONE section of a larger BRD document. Decompose ONLY this section's text into one user story per distinct requirement it contains — do not invent requirements from other sections, and do not skip anything this section actually states.

Document background (context only — do not extract stories from this, it's shared across every section of the document):
"""
{{BACKGROUND}}
"""

Other section headings in this document (titles only, for context if this section references another one, e.g. "using the same fields as login"):
- {{SIBLING_HEADINGS}}

This section's text — decompose THIS into user stories:
"""
{{TEXT}}
"""
