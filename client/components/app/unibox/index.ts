/* M7 Unibox (ENG-57): the app view, triage, thread view and Corral's draft states. */
export { UniboxView, UNIBOX_TABS, inTab, needsYou, type UniboxViewProps } from "./UniboxView";
export { DraftArea, draftText, type DraftActions, type DraftProps } from "./Copilot";
export { FilterChips, KeysSheet, KEY_GROUPS, RowTag, TriageMenu } from "./Triage";
export { FitSummary, History, MailboxLine, Message, SentMessage, SequenceTrail, TeammateMessage } from "./Thread";
export { COPILOT as UNIBOX_COPILOT, HANDLED_NOTE, UNIBOX_THREADS, BRIAN_EDIT, TEAMMATE_REPLY, SEND_ERROR, DISCONNECTED, draftKindFor, seedFor as uniboxSeedFor,
  type CopilotModel, type DraftModel, type UniboxSeed, type UniboxTab } from "./data";
