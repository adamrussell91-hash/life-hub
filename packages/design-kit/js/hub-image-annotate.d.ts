export type HubImageAnnotation = {
  id: string;
  body: string;
  selector?: unknown;
};

export function parseImageAnnotation(raw: unknown): HubImageAnnotation | null;
export function normalizeImageAnnotations(list: unknown): HubImageAnnotation[];
export function mountHubImageAnnotator(
  image: HTMLImageElement,
  opts?: {
    annotations?: HubImageAnnotation[];
    readOnly?: boolean;
    onChange?: (annotations: HubImageAnnotation[]) => void;
  }
): Promise<{
  annotator: unknown;
  destroy: () => void;
  getAnnotations: () => HubImageAnnotation[];
}>;
