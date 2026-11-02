import Button from "./Button";

export default function ExitDialog({
  onStay,
  onLeave,
}: {
  onStay: () => void;
  onLeave: () => void;
}) {
  return (
    <>
      <p>
        Answers already checked remain in your word statistics, but this unfinished session will not
        appear in session history.
      </p>
      <div className="inline-actions">
        <Button onClick={onStay}>Keep practising</Button>
        <Button primary onClick={onLeave}>
          End session
        </Button>
      </div>
    </>
  );
}
