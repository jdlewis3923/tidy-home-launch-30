/** Cleaning and general visit checklists share the server's canonical scope. */
import ServiceVisitChecklist from './ServiceVisitChecklist';
export default function CleaningStandardChecklist({ visitId }: { visitId: string }) {
  return <ServiceVisitChecklist visitId={visitId} />;
}
