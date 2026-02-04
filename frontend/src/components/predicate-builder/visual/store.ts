import { create } from "zustand";
import { evaluate as evaluateFOLApi } from "../../../api/fol";
import {
  type BuilderState,
  type BuilderNode,
  type NeighborhoodBlock,
  type PredicatePill,
  type Connective,
  type Comparator,
  type EvaluationResult,
  createPill,
  createGroup,
  createNeighborhood,
  buildFullExpression,
  buildSetComprehension,
  collectVariables,
  isPill,
  isGroup,
  isNeighborhood,
  containsEquivalentNode,
} from "./types";

interface VisualBuilderStore extends BuilderState {
  addNode: (node: BuilderNode, parentId?: string) => void;
  addNodesWithDeduplication: (nodes: BuilderNode[]) => void;
  removeNode: (nodeId: string) => void;
  updateNode: (nodeId: string, updates: Partial<BuilderNode>) => void;
  moveNode: (
    nodeId: string,
    targetParentId: string | null,
    index?: number,
  ) => void;

  groupNodes: (nodeIds: string[], connective?: Connective) => void;
  groupTwoPills: (pillId1: string, pillId2: string) => void;
  addPillToGroup: (groupId: string, pillData: unknown) => void;
  ungroupNodes: (groupId: string) => void;
  reorderNode: (nodeId: string, newIndex: number) => void;

  setRootConnective: (connective: Connective) => void;

  setLocalConnective: (nodeId: string, connective: Connective) => void;
  getConnectiveForNode: (nodeId: string) => Connective;

  toggleVariableProjection: (variable: string) => void;
  setProjectedVariables: (variables: string[]) => void;

  addNeighborhood: (parentId?: string, targetVariable?: string) => void;
  updateNeighborhood: (id: string, updates: Partial<NeighborhoodBlock>) => void;

  evaluate: () => Promise<EvaluationResult | null>;

  clear: () => void;
  clearErrors: () => void;
  getAvailableVariables: () => string[];
  getFOLExpression: () => string;

  addAttributePredicate: (
    attribute: string,
    comparator: string,
    value: string | number | boolean,
    parentId?: string,
    variable?: string,
  ) => void;
  addTopologyPredicate: (
    metric: string,
    comparator: string,
    value: number,
    parentId?: string,
    variable?: string,
  ) => void;
  addTypePredicate: (
    typeName: string,
    parentId?: string,
    variable?: string,
  ) => void;
  addLiftedPredicate: (
    attribute: string,
    value: string,
    parentId?: string,
    variable?: string,
  ) => void;
}

function findNode(
  nodes: BuilderNode[],
  nodeId: string,
  parent: BuilderNode | null = null,
): { node: BuilderNode; parent: BuilderNode | null; index: number } | null {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.id === nodeId) {
      return { node, parent, index: i };
    }

    if (isGroup(node) || isNeighborhood(node)) {
      const found = findNode(node.children, nodeId, node);
      if (found) return found;
    }
  }
  return null;
}

function removeNodeFromTree(
  nodes: BuilderNode[],
  nodeId: string,
): BuilderNode[] {
  return nodes.filter((node) => {
    if (node.id === nodeId) return false;

    if (isGroup(node)) {
      node.children = removeNodeFromTree(node.children, nodeId);
    } else if (isNeighborhood(node)) {
      node.children = removeNodeFromTree(node.children, nodeId);
    }

    return true;
  });
}

function updateNodeInTree(
  nodes: BuilderNode[],
  nodeId: string,
  updates: Partial<BuilderNode>,
): BuilderNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      return { ...node, ...updates } as BuilderNode;
    }

    if (isGroup(node)) {
      return {
        ...node,
        children: updateNodeInTree(node.children, nodeId, updates),
      };
    } else if (isNeighborhood(node)) {
      return {
        ...node,
        children: updateNodeInTree(node.children, nodeId, updates),
      };
    }

    return node;
  });
}

function addNodeToParent(
  nodes: BuilderNode[],
  node: BuilderNode,
  parentId: string | undefined,
): BuilderNode[] {
  if (!parentId) {
    return [...nodes, node];
  }

  return nodes.map((n) => {
    if (n.id === parentId) {
      if (isGroup(n)) {
        return { ...n, children: [...n.children, node] };
      } else if (isNeighborhood(n)) {
        return { ...n, children: [...n.children, node] };
      }
    }

    if (isGroup(n)) {
      return { ...n, children: addNodeToParent(n.children, node, parentId) };
    } else if (isNeighborhood(n)) {
      return { ...n, children: addNodeToParent(n.children, node, parentId) };
    }

    return n;
  });
}

const initialState: BuilderState = {
  children: [],
  rootConnective: "∧",
  localConnectives: {},
  projectedVariables: ["x"],
  isEvaluating: false,
  evaluationResult: null,
  errors: [],
};

export const useVisualBuilderStore = create<VisualBuilderStore>((set, get) => ({
  ...initialState,

  addNode: (node, parentId) => {
    set((state) => {
      const newChildren = addNodeToParent(state.children, node, parentId);
      const newConnectives = { ...state.localConnectives };
      if (!parentId) {
        newConnectives[node.id] = state.rootConnective;
      }
      return {
        children: newChildren,
        localConnectives: newConnectives,
        evaluationResult: null,
      };
    });
  },

  addNodesWithDeduplication: (nodes) => {
    set((state) => {
      const uniqueNodes = nodes.filter(
        (node) => !containsEquivalentNode(state.children, node),
      );
      if (uniqueNodes.length === 0) return state;

      let newChildren = state.children;
      const newConnectives = { ...state.localConnectives };

      for (const node of uniqueNodes) {
        newChildren = addNodeToParent(newChildren, node, undefined);
        newConnectives[node.id] = state.rootConnective;
      }

      return {
        children: newChildren,
        localConnectives: newConnectives,
        evaluationResult: null,
      };
    });
  },

  removeNode: (nodeId) => {
    set((state) => {
      const newConnectives = { ...state.localConnectives };
      delete newConnectives[nodeId];
      return {
        children: removeNodeFromTree(state.children, nodeId),
        localConnectives: newConnectives,
        evaluationResult: null,
      };
    });
  },

  updateNode: (nodeId, updates) => {
    set((state) => ({
      children: updateNodeInTree(state.children, nodeId, updates),
      evaluationResult: null,
    }));
  },

  moveNode: (nodeId, targetParentId, index) => {
    const state = get();
    const found = findNode(state.children, nodeId);
    if (!found) return;

    let newChildren = removeNodeFromTree(state.children, nodeId);

    if (targetParentId) {
      newChildren = addNodeToParent(newChildren, found.node, targetParentId);
    } else {
      if (index !== undefined) {
        newChildren.splice(index, 0, found.node);
      } else {
        newChildren.push(found.node);
      }
    }

    set({ children: newChildren, evaluationResult: null });
  },

  groupNodes: (nodeIds, connective = "∧") => {
    const state = get();

    const nodesToGroup: BuilderNode[] = [];
    const remainingChildren: BuilderNode[] = [];

    for (const child of state.children) {
      if (nodeIds.includes(child.id)) {
        nodesToGroup.push(child);
      } else {
        remainingChildren.push(child);
      }
    }

    if (nodesToGroup.length < 2) return;

    const group = createGroup(nodesToGroup, connective);

    const newConnectives = { ...state.localConnectives };
    nodeIds.forEach((id) => delete newConnectives[id]);
    newConnectives[group.id] = state.rootConnective;

    set({
      children: [...remainingChildren, group],
      localConnectives: newConnectives,
      evaluationResult: null,
    });
  },

  groupTwoPills: (targetPillId, droppedPillId) => {
    const state = get();

    const targetFound = findNode(state.children, targetPillId);
    const droppedFound = findNode(state.children, droppedPillId);

    if (!targetFound || !droppedFound) {
      return;
    }

    const targetParent = targetFound.parent;
    const droppedParent = droppedFound.parent;

    const targetAtRoot = state.children.some((c) => c.id === targetPillId);
    const droppedAtRoot = state.children.some((c) => c.id === droppedPillId);

    const replaceChildrenInParent = (
      nodes: BuilderNode[],
      parentId: string,
      newChildren: BuilderNode[],
    ): BuilderNode[] => {
      return nodes.map((node) => {
        if (node.id === parentId) {
          if (isGroup(node) || isNeighborhood(node)) {
            return { ...node, children: newChildren };
          }
        }
        if (isGroup(node)) {
          return {
            ...node,
            children: replaceChildrenInParent(
              node.children,
              parentId,
              newChildren,
            ),
          };
        }
        if (isNeighborhood(node)) {
          return {
            ...node,
            children: replaceChildrenInParent(
              node.children,
              parentId,
              newChildren,
            ),
          };
        }
        return node;
      });
    };

    if (targetAtRoot && droppedAtRoot) {
      const remainingChildren = state.children.filter(
        (c) => c.id !== targetPillId && c.id !== droppedPillId,
      );
      const group = createGroup([targetFound.node, droppedFound.node], "∧");
      const newConnectives = { ...state.localConnectives };
      delete newConnectives[targetPillId];
      delete newConnectives[droppedPillId];
      newConnectives[group.id] = state.rootConnective;

      set({
        children: [...remainingChildren, group],
        localConnectives: newConnectives,
        evaluationResult: null,
      });
      return;
    }

    if (targetParent && droppedParent && targetParent.id === droppedParent.id) {
      const parent = targetParent;
      if (isNeighborhood(parent) || isGroup(parent)) {
        const remainingChildren = parent.children.filter(
          (c) => c.id !== targetPillId && c.id !== droppedPillId,
        );
        const group = createGroup([targetFound.node, droppedFound.node], "∧");
        const newParentChildren = [...remainingChildren, group];

        set({
          children: replaceChildrenInParent(
            state.children,
            parent.id,
            newParentChildren,
          ),
          evaluationResult: null,
        });
        return;
      }
    }

    return;
  },

  addPillToGroup: (groupId, pillData) => {
    const state = get();

    const updateGroupInChildren = (
      children: BuilderNode[],
      targetGroupId: string,
      newPill: BuilderNode,
    ): BuilderNode[] => {
      return children.map((child) => {
        if (child.id === targetGroupId && isGroup(child)) {
          return {
            ...child,
            children: [...child.children, newPill],
          };
        }
        if (isGroup(child)) {
          return {
            ...child,
            children: updateGroupInChildren(
              child.children,
              targetGroupId,
              newPill,
            ),
          };
        }
        return child;
      });
    };

    const data = pillData as {
      type: string;
      pillId?: string;
      predicateType?: string;
      attribute?: string;
      metric?: string;
      typeName?: string;
      comparator?: string;
      value?: unknown;
    };

    let newPill: PredicatePill | null = null;

    if (data.type === "move-pill" && data.pillId) {
      const found = findNode(state.children, data.pillId);
      if (found && isPill(found.node)) {
        const remainingChildren = state.children.filter(
          (c) => c.id !== data.pillId,
        );
        const newConnectives = { ...state.localConnectives };
        delete newConnectives[data.pillId];

        set({
          children: updateGroupInChildren(
            remainingChildren,
            groupId,
            found.node,
          ),
          localConnectives: newConnectives,
          evaluationResult: null,
        });
        return;
      }
    } else if (data.type === "reorder-node" && data.pillId) {
      const found = findNode(state.children, data.pillId);
      if (found && (isGroup(found.node) || isNeighborhood(found.node))) {
        if (data.pillId === groupId) return;

        const remainingChildren = state.children.filter(
          (c) => c.id !== data.pillId,
        );
        const newConnectives = { ...state.localConnectives };
        delete newConnectives[data.pillId];

        set({
          children: updateGroupInChildren(
            remainingChildren,
            groupId,
            found.node,
          ),
          localConnectives: newConnectives,
          evaluationResult: null,
        });
        return;
      }
    } else if (data.type === "inferred-predicate") {
      const variable = "x";

      if (data.predicateType === "attribute" && data.attribute) {
        newPill = createPill("attribute", {
          variable,
          attribute: data.attribute,
          comparator: (data.comparator ?? "=") as Comparator,
          value: (data.value as string | number | boolean) ?? "",
        });
      } else if (data.predicateType === "topology" && data.metric) {
        newPill = createPill("topology", {
          variable,
          attribute: data.metric,
          comparator: (data.comparator ?? ">") as Comparator,
          value: Number(data.value) || 0,
        });
      } else if (data.predicateType === "type" && data.typeName) {
        newPill = createPill("type", {
          variable,
          typeName: data.typeName,
        });
      }
    }

    if (newPill) {
      set({
        children: updateGroupInChildren(state.children, groupId, newPill),
        evaluationResult: null,
      });
    }
  },

  ungroupNodes: (groupId) => {
    const state = get();
    const found = findNode(state.children, groupId);

    if (!found || !isGroup(found.node)) return;

    const newChildren = state.children.filter((c) => c.id !== groupId);
    newChildren.push(...found.node.children);

    set({ children: newChildren, evaluationResult: null });
  },

  reorderNode: (nodeId, newIndex) => {
    const state = get();
    const currentIndex = state.children.findIndex((c) => c.id === nodeId);
    if (currentIndex === -1 || currentIndex === newIndex) return;

    const newChildren = [...state.children];
    const [removed] = newChildren.splice(currentIndex, 1);
    newChildren.splice(newIndex, 0, removed);

    const newConnectives = { ...state.localConnectives };

    set({
      children: newChildren,
      localConnectives: newConnectives,
      evaluationResult: null,
    });
  },

  setRootConnective: (connective) => {
    set({ rootConnective: connective, evaluationResult: null });
  },

  setLocalConnective: (nodeId, connective) => {
    set((state) => ({
      localConnectives: {
        ...state.localConnectives,
        [nodeId]: connective,
      },
      evaluationResult: null,
    }));
  },

  getConnectiveForNode: (nodeId) => {
    const state = get();
    return state.localConnectives[nodeId] ?? state.rootConnective;
  },

  toggleVariableProjection: (variable) => {
    set((state) => {
      const vars = state.projectedVariables;
      if (vars.includes(variable)) {
        if (variable === "x") return state;
        return { projectedVariables: vars.filter((v) => v !== variable) };
      } else {
        return { projectedVariables: [...vars, variable].sort() };
      }
    });
  },

  setProjectedVariables: (variables) => {
    const vars = variables.includes("x") ? variables : ["x", ...variables];
    set({ projectedVariables: vars.sort() });
  },

  addNeighborhood: (parentId, targetVariable = "x") => {
    const neighborhood = createNeighborhood(targetVariable);
    get().addNode(neighborhood, parentId);
  },

  updateNeighborhood: (id, updates) => {
    if ("includeInResult" in updates) {
      const state = get();
      const found = findNode(state.children, id);
      if (found && isNeighborhood(found.node)) {
        const boundVar = found.node.boundVariable;
        const willInclude = updates.includeInResult;
        const currentVars = state.projectedVariables;
        const newVars = willInclude
          ? currentVars.includes(boundVar)
            ? currentVars
            : [...currentVars, boundVar].sort()
          : currentVars.filter((v) => v !== boundVar);
        set((s) => ({
          children: updateNodeInTree(s.children, id, updates),
          projectedVariables: newVars,
          evaluationResult: null,
        }));
        return;
      }
    }
    get().updateNode(id, updates);
  },

  evaluate: async () => {
    const state = get();
    const expression = buildFullExpression(state);

    if (!expression) {
      set({ errors: ["No predicates to evaluate"] });
      return null;
    }

    set({ isEvaluating: true, errors: [] });

    try {
      const projectVars =
        state.projectedVariables.length > 1
          ? state.projectedVariables
          : undefined;

      const result = await evaluateFOLApi(expression, projectVars);

      const evaluationResult: EvaluationResult = {
        matchingNodes: result.matchingNodes,
        projections: result.projections,
        folExpression: result.folExpression,
        evaluationTimeMs: result.evaluationTimeMs,
      };

      set({
        evaluationResult,
        errors: result.errors || [],
        isEvaluating: false,
      });

      return evaluationResult;
    } catch (e) {
      set({
        evaluationResult: null,
        errors: [e instanceof Error ? e.message : "Evaluation failed"],
        isEvaluating: false,
      });
      return null;
    }
  },

  clear: () => {
    set(initialState);
  },

  clearErrors: () => {
    set({ errors: [] });
  },

  getAvailableVariables: () => {
    return collectVariables(get().children);
  },

  getFOLExpression: () => {
    return buildSetComprehension(get());
  },

  addAttributePredicate: (
    attribute,
    comparator,
    value,
    parentId,
    variable = "x",
  ) => {
    const pill = createPill("attribute", {
      attribute,
      comparator: comparator as Comparator,
      value,
      variable,
    });
    get().addNode(pill, parentId);
  },

  addTopologyPredicate: (
    metric,
    comparator,
    value,
    parentId,
    variable = "x",
  ) => {
    const pill = createPill("topology", {
      attribute: metric,
      comparator: comparator as Comparator,
      value,
      variable,
    });
    get().addNode(pill, parentId);
  },

  addTypePredicate: (typeName, parentId, variable = "x") => {
    const pill = createPill("type", { typeName, variable });
    get().addNode(pill, parentId);
  },

  addLiftedPredicate: (attribute, value, parentId, variable = "x") => {
    const pill = createPill("lifted", {
      liftedAttribute: attribute,
      liftedValue: value,
      variable,
    });
    get().addNode(pill, parentId);
  },
}));
