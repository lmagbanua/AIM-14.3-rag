// User-visible copy about the corpus. To change the corpus, update
// corpus/manifest.json and this file — nothing else in the UI changes.
export const APP_NAME = "Cyber Guidance Chat";

export const CORPUS_DESCRIPTION =
  "Ask questions about three U.S. government cybersecurity guides: the NIST Cybersecurity Framework 2.0, the FTC's Data Breach Response guide for business, and the CISA Cyber Essentials Starter Kit. Every answer is grounded in these documents and shows the exact passages it was based on, with document and page.";

// Chosen to span documents: one per source, plus one whose answer draws on
// more than one guide, so the multi-document citations are visible.
export const EXAMPLE_QUESTIONS = [
  "What are the six core functions of the NIST Cybersecurity Framework?",
  "What should a business do first after discovering a data breach?",
  "What does CISA say a leader's role is in building a culture of cyber readiness?",
  "How should a small organization prepare for and respond to a cyber incident?",
];
