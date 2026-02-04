import { useCallback, useEffect, useRef } from "react";
import { useLearningStore } from "../store/learningStore";

export function usePredicateLearning(selectedNodeIds: string[]) {
  const store = useLearningStore();
  const previousSelectionRef = useRef<string[]>([]);

  const shouldAutoLearn = useCallback(() => {
    if (selectedNodeIds.length === 0) return false;
    if (selectedNodeIds.length > 500) return false;

    const prev = previousSelectionRef.current;
    if (prev.length !== selectedNodeIds.length) return true;

    return !selectedNodeIds.every((n, i) => prev[i] === n);
  }, [selectedNodeIds]);

  useEffect(() => {
    if (shouldAutoLearn()) {
      store.quickLearn(selectedNodeIds);
      previousSelectionRef.current = selectedNodeIds;
    } else if (
      selectedNodeIds.length === 0 &&
      store.learnedPredicates.length > 0
    ) {
      store.clearLearned();
      previousSelectionRef.current = [];
    }
  }, [selectedNodeIds, shouldAutoLearn, store]);

  return {
    learnedPredicates: store.learnedPredicates,
    bestPredicate: store.bestPredicate,
    isLearning: store.isLearning,
    learningTimeMs: store.learningTimeMs,
    error: store.error,
    learn: () => store.learn(selectedNodeIds),
    quickLearn: () => store.quickLearn(selectedNodeIds),
    clear: store.clearLearned,
  };
}
