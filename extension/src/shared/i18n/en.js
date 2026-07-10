// English localization (structure prepared for future use, ТЗ 15).

export default {
  "verdict.TRUE": "True",
  "verdict.MOSTLY_TRUE": "Mostly true",
  "verdict.MISLEADING": "Misleading",
  "verdict.FALSE": "False",
  "verdict.UNVERIFIABLE": "Unverifiable",
  "verdict.OPINION_NOT_CHECK_WORTHY": "Opinion / not check-worthy",

  "status.idle": "Idle",
  "status.checking": "Checking…",
  "status.done": "Done",
  "status.error": "Error",

  "test.success": "Connection works",
  "test.unauthorized": "Authorization error: check API key and auth mode",
  "test.invalid_base_url": "Endpoint not found: check base URL and path",
  "test.cors_or_permission": "Network error: wrong address, CORS or missing origin permission",
  "test.model_not_found": "Model not found: check the model name",
  "test.insufficient_credits": "Insufficient credits or quota",
  "test.rate_limit": "Rate limit exceeded, try again later",
  "test.parse_error": "Response received but could not be parsed",
  "test.unknown": "Unknown error",

  "ui.noSelection": "Select some text on the page first.",
  "ui.noPageAccess":
    "No access to this page (Firefox system pages are restricted). Paste text manually.",
  "ui.emptyText": "Enter or paste text to check.",
  "ui.noClaims": "No checkable factual claims found.",
  "ui.truncated": "The text exceeded the limit and was truncated.",
  "ui.copied": "Copied",
  "ui.speaker": "Speaker",
  "ui.sources": "Sources",
  "ui.needsReview": "Needs manual review",
  "ui.confidence": "Confidence",
  "ui.disclaimer":
    "Automatic fact-checking can be wrong. Do not treat the result as the final source of truth.",
};
