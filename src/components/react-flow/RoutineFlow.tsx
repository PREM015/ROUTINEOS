"use client";

import { useCallback, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  type OnEdgesChange,
  type OnNodesChange,
} from "@xyflow/react";

const initialNodes: Node[] = [
  {
    id: "goal-1",
    position: { x: 100, y: 100 },
    data: { label: "Complete GATE Preparation" },
  },
  {
    id: "project-1",
    position: { x: 100, y: 250 },
    data: { label: "GATE Study Plan" },
  },
  {
    id: "task-1",
    position: { x: 100, y: 400 },
    data: { label: "Daily GATE Practice" },
  },
];

const initialEdges: Edge[] = [
  {
    id: "goal-project",
    source: "goal-1",
    target: "project-1",
  },
  {
    id: "project-task",
    source: "project-1",
    target: "task-1",
  },
];

export default function RoutineFlow() {
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      setNodes((currentNodes) =>
        applyNodeChanges(changes, currentNodes)
      );
    },
    []
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      setEdges((currentEdges) =>
        applyEdgeChanges(changes, currentEdges)
      );
    },
    []
  );

  const onConnect = useCallback((connection: Connection) => {
    setEdges((currentEdges) =>
      addEdge(connection, currentEdges)
    );
  }, []);

  return (
    <div className="h-[600px] w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}