import Button from "./Button";

// Leaving the list editor with rows missing a word, or pasted text not imported.
export default function LeaveDialog({
  onStay,
  onLeave,
}: {
  onStay: () => void;
  onLeave: () => void;
}) {
  return (
    <>
      <p>
        Everything else is saved, but word pairs missing a word and pasted text that isn’t imported
        will be lost.
      </p>
      <div className="inline-actions">
        <Button onClick={onStay}>Keep editing</Button>
        <Button primary onClick={onLeave}>
          Leave anyway
        </Button>
      </div>
    </>
  );
}
