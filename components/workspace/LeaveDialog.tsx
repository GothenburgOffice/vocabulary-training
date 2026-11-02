import Button from "./Button";

// Leaving the list editor when some edits can't be saved yet: says which ones would be lost.
export default function LeaveDialog({
  lost,
  onStay,
  onLeave,
}: {
  lost: string[];
  onStay: () => void;
  onLeave: () => void;
}) {
  return (
    <>
      <p>Everything else is saved. Leaving now loses:</p>
      <ul className="lost-edits">
        {lost.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <div className="inline-actions">
        <Button onClick={onStay}>Keep editing</Button>
        <Button primary onClick={onLeave}>
          Leave anyway
        </Button>
      </div>
    </>
  );
}
