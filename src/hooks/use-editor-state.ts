'use client';

import { useState } from 'react';

// 列表 + 編輯面板的開關狀態。target 為 null 表示新增。
// 關閉時保留 target，讓關閉動畫跑完；每次打開都換 key，讓表單重新開始。
export function useEditorState<Target>() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<{ target: Target | null; key: number }>({
    target: null,
    key: 0,
  });

  function openEditor(target: Target | null) {
    setEditing((current) => ({ target, key: current.key + 1 }));
    setOpen(true);
  }

  return { open, setOpen, target: editing.target, key: editing.key, openEditor };
}
