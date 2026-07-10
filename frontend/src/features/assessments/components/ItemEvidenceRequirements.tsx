import { Badge } from '@/src/components/ui/Badge';
import { MediaEvidencePanel } from '@/src/features/assessments/components/MediaEvidencePanel';
import {
  itemEvidenceStatusLabels,
  itemEvidenceTypeLabels,
} from '@/src/features/assessments/lib/assessment-execution-display';
import type { ItemMediaDrafts } from '@/src/features/assessments/types/media-evidence-draft';
import type {
  EvidenceRequirementState,
  SupportedMediaEvidenceType,
} from '@/src/features/assessments/types/media-evidence';
import type { ItemResponseExecution } from '@/src/features/assessments/types/item-response-execution';

const mediaResponseTypes = new Set([
  'drawing',
  'photo_upload',
  'handwriting',
]);

export function ItemEvidenceRequirements({
  drafts,
  item,
  onDraftChange,
  onEndWrite,
  onRequirementChange,
  onTryBeginWrite,
  pageReadOnlyReason,
  patientId,
  scaleInstanceId,
  visitId,
  writingTypes,
}: {
  drafts: ItemMediaDrafts;
  item: ItemResponseExecution;
  onDraftChange: (
    evidenceType: SupportedMediaEvidenceType,
    draft: ItemMediaDrafts[SupportedMediaEvidenceType] | null,
  ) => void;
  onEndWrite: (evidenceType: SupportedMediaEvidenceType) => void;
  onRequirementChange: (requirement: EvidenceRequirementState) => void;
  onTryBeginWrite: (evidenceType: SupportedMediaEvidenceType) => boolean;
  pageReadOnlyReason: string | null;
  patientId: string;
  scaleInstanceId: string;
  visitId: string;
  writingTypes: ReadonlySet<SupportedMediaEvidenceType>;
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
          photo 与 handwriting 已支持采集、预览和作废；audio 与其他媒体类型尚未开放。上传证据不代表本题已完成或已评分。
        </p>
      ) : null}
      {item.evidenceRequirements.some(
        (requirement) =>
          requirement.evidenceType === 'photo' ||
          requirement.evidenceType === 'handwriting',
      ) ? (
        <MediaEvidencePanel
          drafts={drafts}
          item={item}
          onDraftChange={onDraftChange}
          onEndWrite={onEndWrite}
          onRequirementChange={onRequirementChange}
          onTryBeginWrite={onTryBeginWrite}
          pageReadOnlyReason={pageReadOnlyReason}
          patientId={patientId}
          scaleInstanceId={scaleInstanceId}
          visitId={visitId}
          writingTypes={writingTypes}
        />
      ) : null}
    </section>
  );
}
