import { Badge } from '@/src/components/ui/Badge';
import {
  itemEvidenceStatusLabels,
  itemEvidenceTypeLabels,
} from '@/src/features/assessments/lib/assessment-execution-display';
import type { ItemResponseExecution } from '@/src/features/assessments/types/item-response-execution';

const mediaResponseTypes = new Set([
  'drawing',
  'photo_upload',
  'handwriting',
]);

export function ItemEvidenceRequirements({
  item,
}: {
  item: ItemResponseExecution;
}) {
  const hasMediaRequirement =
    mediaResponseTypes.has(item.responseType) ||
    item.evidenceRequirements.some(
      (requirement) =>
        requirement.evidenceType === 'photo' ||
        requirement.evidenceType === 'handwriting' ||
        requirement.evidenceType === 'audio',
    );

  return (
    <section
      aria-labelledby={`${item.id}-evidence-title`}
      className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4"
    >
      <h4
        className="font-semibold text-[var(--cma-text-strong)]"
        id={`${item.id}-evidence-title`}
      >
        证据要求
      </h4>
      {item.evidenceRequirements.length > 0 ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {item.evidenceRequirements.map((requirement) => (
            <li
              className="flex flex-wrap items-center gap-2 text-sm text-[var(--cma-text-strong)]"
              key={`${requirement.evidenceType}:${requirement.status}`}
            >
              <span>{itemEvidenceTypeLabels[requirement.evidenceType]}</span>
              <Badge>{itemEvidenceStatusLabels[requirement.status]}</Badge>
              <span className="text-[var(--cma-muted)]">
                {requirement.attached
                  ? '服务端标识：已关联'
                  : '服务端标识：未关联'}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm leading-6 text-[var(--cma-muted)]">
          服务端未返回本题证据要求。
        </p>
      )}
      {hasMediaRequirement ? (
        <p className="mt-3 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-info-soft)] px-3 py-2 text-sm leading-6 text-[var(--cma-info)]">
          媒体证据将在后续阶段接入；本页不提供文件上传、拍照、画布或手写轨迹，也不会创建虚假的已上传状态。
        </p>
      ) : null}
    </section>
  );
}
