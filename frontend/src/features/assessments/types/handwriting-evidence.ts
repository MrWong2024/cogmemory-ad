import type { HandwritingInputTool } from '@/src/features/assessments/types/media-evidence';

export type HandwritingPoint = {
  x: number;
  y: number;
  t: number;
  pressure: number;
};

export type HandwritingStroke = {
  tool: HandwritingInputTool;
  points: HandwritingPoint[];
};

export type HandwritingTrajectoryPayload = {
  version: 1;
  coordinateSpace: {
    width: number;
    height: number;
  };
  strokes: HandwritingStroke[];
};

export type HandwritingDraft = {
  strokes: HandwritingStroke[];
  canvasWidth: number;
  canvasHeight: number;
  drawingStartedAtMs: number;
  description: string;
  captureNote: string;
  operatorNote: string;
  includeTrajectory: boolean;
};
