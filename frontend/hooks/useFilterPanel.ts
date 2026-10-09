import { useLayoutEffect, useRef, useState } from 'react';
import { FlatList, Keyboard, ScrollView } from 'react-native';

// Criteria belong in the list header so fields and results share one scroll
// surface. Do not enable maintainVisibleContentPosition on these lists: a
// shrinking header can cause native anchoring to introduce a blank top gap.
export const filterScrollProps = {
  keyboardShouldPersistTaps: 'handled' as const,
  keyboardDismissMode: 'on-drag' as const,
  automaticallyAdjustKeyboardInsets: true,
};

export function useFilterPanel<T = any>() {
  const [expanded, setExpanded] = useState(false);
  const listRef = useRef<FlatList<T>>(null);
  const scrollRef = useRef<ScrollView>(null);
  const previousExpanded = useRef(expanded);

  useLayoutEffect(() => {
    if (previousExpanded.current === expanded) return;
    previousExpanded.current = expanded;
    Keyboard.dismiss();
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [expanded]);

  return {
    expanded,
    setExpanded,
    toggle: () => setExpanded(current => !current),
    listRef,
    scrollRef,
  };
}
