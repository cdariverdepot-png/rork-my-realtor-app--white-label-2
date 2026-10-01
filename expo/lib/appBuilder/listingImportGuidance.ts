/** Explanations belong in assistant messages; action labels stay short. */
export const LISTING_IMPORT_GUIDANCE = {
  intro: "I’ve saved the information already imported. If your listings need sign-in, a private link won’t give me access. You can use a public sharing link or upload a listing file instead.",
  link: "Paste a link someone can open without signing in. For example, your MLS public sharing link, your brokerage’s ‘My listings’ page, or an IDX property list. Open it in a private browser window first to check that the properties appear. I’ll follow its property links and try importing them.",
  file: "You can bring in several properties from one report—there’s no need to type each listing. Choose PDF, CSV, Word (.docx), plain text (.txt), or clear JPG, PNG or WebP screenshots. Upload up to 5 files, under 20 MB each and 50 MB combined.\n\nExamples: save a public property report from your MLS as a PDF; export a listing spreadsheet from Excel or Google Sheets as CSV; or upload a property flyer or screenshots that show the addresses and details.\n\nFor Flexmls, select your listings, choose Print, and save the public property report as a PDF. Include addresses, MLS numbers, prices and available specifications. I can import the details shown; screenshots and PDFs may need photos added afterward. This imports a snapshot, so you’ll need to upload a fresh report when details change.",
  manual: "Prefer to add properties yourself? You can do that from your dashboard after setup.",
};

export const LISTING_FILE_PICKER_TYPES = [
  "application/pdf", "text/csv", "application/csv", "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg", "image/png", "image/webp",
];
