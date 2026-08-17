import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";

/**
 * Turning a stored audit row back into a sentence in the reader's language.
 *
 * An audit row is append-only: its `summary` was written in English at the
 * moment the thing happened and must never be rewritten, because the whole
 * value of the log is that nobody — including us — edits it afterwards. So the
 * Chinese sentence is not a translation of the stored text. It is the same
 * event, said again, from the parts the row still carries: the action code,
 * and the names and counts recovered from the summary it was written with.
 *
 * That means two rules hold here and nowhere else in the app:
 *
 *   1. A sentence is composed as a whole, per event, with the slots put where
 *      Chinese grammar wants them. "Imported 12 shipment(s) into GZ/26-28"
 *      becomes "从广州装箱单导入 12 票货件至批次 GZ/26-28" — one sentence, not
 *      four translated fragments in English order.
 *   2. Anything not recognised falls through to the stored English. A row we
 *      cannot re-say is still a row that must be readable; a half-guessed
 *      Chinese sentence about money moving is worse than English.
 */

/** Slots are written `{name}` so a translator can move them, or reorder them. */
function fill(template: string, values: Record<string, string>): string {
  const filled = template.replace(/\{(\w+)\}/g, (slot, key: string) =>
    key in values ? values[key] : slot
  );
  // Chinese sets no space between its own characters. The space that separates
  // "{name} 登录了系统" is there for "Nino"; it is noise after "李伟".
  return filled.replace(/(?<=[一-鿿])[ ]+(?=[一-鿿])/g, "");
}

/**
 * The sentence templates. The English side of each is exactly what the writer
 * stored, so filling the English template reproduces the row verbatim — if a
 * template ever drifts from what is being written, English breaks visibly
 * rather than Chinese breaking quietly.
 */
const SIGNED_IN = "{name} signed in";
const PACKING_LIST_IMPORT =
  "Imported {count} consignment(s) into {batch} from the {origin} packing list";

const SIGNED_IN_MATCH = /^(.+?) signed in$/;
const PACKING_LIST_MATCH =
  /^Imported (\d+) shipment\(s\) into (.+?) from the (Hong Kong|Guangzhou) packing list$/;

type AuditRow = {
  action: string;
  summary: string;
};

/**
 * What happened, in one sentence, for this reader.
 *
 * Matched on the action first and the stored wording second: the action code
 * is the thing the writer chose deliberately, and the summary is only the
 * carrier of the names and numbers inside it.
 */
export function auditSentence(locale: Locale, entry: AuditRow): string {
  if (entry.action === "auth.login") {
    const name = SIGNED_IN_MATCH.exec(entry.summary)?.[1];
    if (name) return fill(t(locale, SIGNED_IN), { name });
  }

  if (entry.action === "batch.import") {
    const parts = PACKING_LIST_MATCH.exec(entry.summary);
    if (parts) {
      const [, count, batch, origin] = parts;
      return fill(t(locale, PACKING_LIST_IMPORT), {
        count,
        batch,
        origin: t(locale, origin),
      });
    }
  }

  return entry.summary;
}

/**
 * What kind of event this was.
 *
 * The stored action is a code — `batch.seal`, `pickupNote.cancel` — and a code
 * is not a language. It reads as English to a Chinese CEO and as jargon to an
 * English one, so the log shows the name of the event and keeps the code on
 * hover, where anyone who needs it to search is the person who knows it exists.
 *
 * An action with no entry here shows its raw code rather than a guess.
 */
const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Signed in",

  "shipment.create": "Cargo registered",
  "shipment.update": "Cargo edited",
  "shipment.cancel": "Cargo cancelled",
  "shipment.release": "Cargo released",
  "cargo.delete": "Cargo deleted",
  "cargo.restore": "Cargo restored",
  "cargo.purge": "Cargo permanently removed",
  "shipment.attachDocument": "Paperwork attached to cargo",
  "shipment.removeDocument": "Paperwork removed from cargo",
  "label.print": "Labels printed",

  "storage.charged": "Storage fee charged",
  "storage.waived": "Storage fee waived",

  "batch.create": "Batch opened",
  "batch.addShipment": "Cargo added to a batch",
  "batch.removeShipment": "Cargo removed from a batch",
  "batch.seal": "Batch sealed",
  "batch.depart": "Batch departed",
  "batch.dispatch": "Dispatched on a flight",
  "batch.receive": "Batch arrived",
  "batch.completeVerification": "Batch check-in finished",
  "batch.import": "Packing list imported",

  "invoice.confirm": "Invoice confirmed",
  "invoice.confirmBatch": "Prices confirmed on a dispatch",
  "invoice.adjust": "Invoice adjusted",
  "payment.record": "Payment recorded",
  "payment.submitted": "Payment claimed",
  "payment.verified": "Payment verified",
  "payment.rejected": "Payment sent back",
  "payment.attribute": "Payment attributed to an account",
  "pickupNote.issue": "Pickup note issued",
  "pickupNote.cancel": "Pickup note cancelled",
  "expense.approve": "Expense approved",
  "expense.pay": "Expense paid",
  "expense.void": "Expense cancelled",
  "transfer.record": "Money moved between accounts",
  "cash.count": "Cash counted",
  "account.setOpeningBalance": "Opening balance set",
  "fx.setRate": "Exchange rate set",

  "pricing.createProduct": "Product added",
  "pricing.publishRule": "Price published",
  "pricing.withdrawRule": "Price withdrawn",
  "pricing.revisePrice": "Price revised",

  "exception.raise": "Exception raised",
  "exception.status": "Exception status changed",
  "exception.assign": "Exception assigned",
  "exception.note": "Note added to an exception",
  "exception.cargoFound": "Cargo found",
  "exception.compensate": "Compensation recorded",
  "exception.approveCompensation": "Compensation approved",
  "exception.resolve": "Exception closed",

  "customer.create": "Customer added",
  "customer.notes": "Customer notes updated",
  "ticket.create": "Support ticket opened",
  "ticket.update": "Support ticket updated",
  "sourcing.create": "Sourcing request opened",
  "sourcing.update": "Sourcing request updated",
  "message.log": "Message to a customer logged",

  "user.create": "Staff account created",
  "user.changeRole": "Role changed",
  "user.resetPassword": "Password reset",
  "profile.update": "Profile updated",
  "profile.password": "Password changed",
  "settings.update": "Company settings updated",
  "settings.reset": "Company settings reset",
  "system.seed": "Demo data loaded",
};

export function auditActionLabel(locale: Locale, action: string): string {
  const label = ACTION_LABELS[action];
  return label ? t(locale, label) : action;
}
