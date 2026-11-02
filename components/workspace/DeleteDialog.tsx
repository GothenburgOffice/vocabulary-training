import { Trash2 } from "lucide-react";
import { listTitle, type List } from "../../lib/learning";
import Button from "./Button";

export default function DeleteDialog({
  list,
  onCancel,
  onDelete,
}: {
  list: List;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const words = list.words.length;
  return (
    <>
      <p>
        <strong>{listTitle(list)}</strong> and its {words} word{words === 1 ? "" : "s"} will be
        deleted, with their review history. Completed sessions stay in your session history.
      </p>
      <p>This can’t be undone.</p>
      <div className="inline-actions">
        <Button onClick={onCancel}>Cancel</Button>
        <Button danger onClick={onDelete}>
          <Trash2 size={16} /> Delete list
        </Button>
      </div>
    </>
  );
}
