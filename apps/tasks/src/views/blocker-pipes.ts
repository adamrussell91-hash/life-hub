import { layoutPipeIllustration } from '@/domain/pipe-chain-layout';
import { renderPipeIllustration } from '@/views/blocker-pipe-chain';

export function renderBlockerPipes(
  focusId: string | null,
  tasks: Parameters<typeof layoutPipeIllustration>[1],
  onSelectGate: (taskId: string) => void
): HTMLElement {
  const layout = layoutPipeIllustration(focusId, tasks);
  return renderPipeIllustration(layout, onSelectGate);
}
