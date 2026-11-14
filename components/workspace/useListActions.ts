import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { encodeCSV, listTitle, type List } from "@/lib/learning";
import type { WorkspaceSync } from "@/lib/workspace";
import type { Modal, View } from "./views";

type Notice = { text: string; warning?: boolean } | null;
type Props = {
  lists: List[];
  setLists: Dispatch<SetStateAction<List[]>>;
  // The selected list, which export writes.
  list: List | undefined;
  baseLanguage: string;
  learningLanguage: string;
  setSelected: (id: string) => void;
  setLearningLanguage: (language: string) => void;
  setQuery: (query: string) => void;
  setView: (view: View) => void;
  setNav: (open: boolean) => void;
  setNotice: (notice: Notice) => void;
  setModal: (modal: Modal | null) => void;
  startTest: (onlyMistakes?: boolean, target?: List) => void;
  sync?: WorkspaceSync;
};

// Creating, editing, leaving the editor, deleting and exporting lists. Workspace keeps the lists;
// this changes them and reports each change to `sync`.
export function useListActions({
  lists,
  setLists,
  list,
  baseLanguage,
  learningLanguage,
  setSelected,
  setLearningLanguage,
  setQuery,
  setView,
  setNav,
  setNotice,
  setModal,
  startTest,
  sync,
}: Props) {
  // The list open in the editor, as it was when opened.
  const [editing, setEditing] = useState<List | null>(null);
  // Whether leaving the list editor would lose edits, and where leaving it was headed.
  const [editorLost, setEditorLost] = useState<string[]>([]);
  // The editor's latest draft, so every way out of it (Done, the sidebar, the logo) shows it.
  const editorDraft = useRef<List | null>(null);
  // Lists being deleted: a save the editor still had waiting must not recreate them.
  const deletedIds = useRef(new Set<string>());
  const [leaving, setLeaving] = useState<{ to: View | "practice"; list?: List } | null>(null);
  // The list the delete dialog asks about.
  const [deleting, setDeleting] = useState<List | null>(null);

  function edit(target?: List) {
    setEditing(
      target
        ? structuredClone(target)
        : {
            id: crypto.randomUUID(),
            title: "",
            description: "",
            from: baseLanguage,
            to: learningLanguage,
            words: [],
          },
    );
    setView("editor");
    setNotice(null);
  }
  // An imported draft opens in the editor, not saved until it is edited there.
  function editDraft(draft: List) {
    setEditing(draft);
    setView("editor");
  }
  // The editor autosaves through this; it never leaves the editor.
  function saveList(saved: List) {
    if (deletedIds.current.has(saved.id)) return;
    setLists((ls) =>
      ls.some((l) => l.id === saved.id)
        ? ls.map((l) => (l.id === saved.id ? saved : l))
        : [...ls, saved],
    );
    sync?.saveList(saved);
  }
  // Leaving the editor saves what's waiting (ListEditor does that as it closes), but would drop
  // unfinished rows or pasted text, so it asks first when there are any.
  function leaveEditor(to: View | "practice", edited = editorDraft.current ?? undefined) {
    if (editorLost.length) {
      setLeaving({ to, list: edited });
      setModal("leave");
      return;
    }
    goFromEditor(to, edited);
  }
  function goFromEditor(to: View | "practice", edited?: List) {
    // Show the edited list in the library, under its (possibly changed) language.
    if (edited && lists.some((l) => l.id === edited.id)) {
      setSelected(edited.id);
      setLearningLanguage(edited.to);
      setQuery("");
    }
    if (to === "practice") startTest(false, edited);
    else {
      setView(to);
      setNav(false);
      setNotice(null);
    }
  }
  // The leave dialog's answers.
  function stayInEditor() {
    setModal(null);
    setLeaving(null);
  }
  function leaveAnyway() {
    setModal(null);
    setLeaving(null);
    if (leaving) goFromEditor(leaving.to, leaving.list);
  }
  function changePending(pending: boolean, lost: string[]) {
    setEditorLost(lost);
    sync?.pending(pending);
  }
  function changeDraft(draft: List) {
    editorDraft.current = draft;
  }
  function askDelete(target: List) {
    setDeleting(target);
    setModal("delete");
  }
  function deleteList(target: List) {
    deletedIds.current.add(target.id);
    setLists((ls) => ls.filter((l) => l.id !== target.id));
    void sync?.deleteList(target.id).then((deleted) => {
      if (deleted) return;
      deletedIds.current.delete(target.id);
      // This tab's copy is stale, so saving it would get 409 too; a reload shows the newer one.
      setLists((ls) => (ls.some((l) => l.id === target.id) ? ls : [...ls, target]));
      setNotice({
        text: `Another tab changed “${listTitle(target)}”, so it wasn't deleted. Reload this tab to see the latest version.`,
        warning: true,
      });
    });
    setSelected("");
    setView("library");
    setModal(null);
    setNotice({ text: "List deleted." });
  }
  function exportList() {
    if (!list) return;
    const blob = new Blob(["﻿" + encodeCSV(list)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${listTitle(list).toLowerCase().replace(/\s+/g, "-")}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice({
      text: "CSV exported. It includes language names and word pairs, not review history.",
    });
  }
  return {
    editing,
    editorLost,
    deleting,
    edit,
    editDraft,
    saveList,
    leaveEditor,
    stayInEditor,
    leaveAnyway,
    changePending,
    changeDraft,
    askDelete,
    deleteList,
    exportList,
  };
}
