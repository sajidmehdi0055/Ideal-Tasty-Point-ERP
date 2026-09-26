import { useEffect, useMemo, useState } from 'react';
import {
  SearchField,
  LoadingState,
  ErrorState,
  EmptyState,
  Button,
} from '../../../design-system/components';
import { PlusIcon } from '../../../design-system/icons';
import { ApiError } from '../../../lib/api-client';
import { listUoms, createUom, updateUom } from './api';
import { UomTable } from './UomTable';
import { UomFormDialog } from './UomFormDialog';
import type { Uom, UomInput } from './types';
import type { UomFieldErrors } from './validation';

type Status = 'loading' | 'live' | 'error';

function describeUomError(error: ApiError): string {
  if (error.status === 401) {
    return 'Not signed in — sign-in is not implemented yet. This is expected until the login/session system ships.';
  }
  if (error.status === 403) {
    return "Your current dev role doesn't have permission — only Owner or Manager can view or manage units of measure.";
  }
  return error.message;
}

export function UomMasterPanel() {
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [togglingId, setTogglingId] = useState<string>();

  const [dialog, setDialog] = useState<{ mode: 'create' | 'edit'; uom?: Uom } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<UomFieldErrors>();

  useEffect(() => {
    let ignore = false;

    async function load() {
      setStatus('loading');
      setError('');
      try {
        const result = await listUoms();
        if (ignore) return;
        setUoms(result);
        setStatus('live');
      } catch (err) {
        if (ignore) return;
        setError(err instanceof ApiError ? describeUomError(err) : 'Something went wrong.');
        setStatus('error');
      }
    }

    void load();
    return () => {
      ignore = true;
    };
  }, [reloadToken]);

  const filteredUoms = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return uoms;
    return uoms.filter(uom => uom.name.toLowerCase().includes(query));
  }, [uoms, search]);

  function closeDialog() {
    setDialog(null);
    setServerError(undefined);
    setFieldErrors(undefined);
  }

  async function handleSubmit(values: UomInput & { active?: boolean }) {
    if (!dialog) return;
    setSubmitting(true);
    setServerError(undefined);
    setFieldErrors(undefined);
    try {
      if (dialog.mode === 'create') {
        await createUom(values);
      } else {
        await updateUom(dialog.uom!.id, values);
      }
      closeDialog();
      setReloadToken(token => token + 1);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'DUPLICATE_UOM_NAME') {
        setFieldErrors({ name: 'A UOM with this name already exists' });
        setServerError('Please fix the highlighted fields.');
      } else if (err instanceof ApiError && err.code === 'VALIDATION_ERROR' && err.issues) {
        const mapped: UomFieldErrors = {};
        for (const issue of err.issues) {
          const field = issue.path[0];
          if (typeof field === 'string') mapped[field as keyof UomFieldErrors] = issue.message;
        }
        setFieldErrors(mapped);
        setServerError('Please fix the highlighted fields.');
      } else if (err instanceof ApiError) {
        setServerError(describeUomError(err));
      } else {
        setServerError('Something went wrong.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(uom: Uom) {
    setTogglingId(uom.id);
    try {
      await updateUom(uom.id, { active: !uom.active });
      setReloadToken(token => token + 1);
    } catch {
      setReloadToken(token => token + 1);
    } finally {
      setTogglingId(undefined);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <SearchField
          label="Search units by name"
          value={search}
          onChange={event => setSearch(event.target.value)}
          onClear={() => setSearch('')}
          className="w-full max-w-sm"
        />
        <Button variant="dark" onClick={() => setDialog({ mode: 'create' })}>
          <PlusIcon className="h-4 w-4" />
          New unit
        </Button>
      </div>

      {status === 'loading' ? <LoadingState label="Loading units…" /> : null}

      {status === 'error' ? (
        <ErrorState message={error} onRetry={() => setReloadToken(token => token + 1)} />
      ) : null}

      {status === 'live' ? (
        filteredUoms.length === 0 ? (
          <EmptyState
            title={uoms.length === 0 ? 'No UOMs yet' : 'No units match your search'}
            message={
              uoms.length === 0 ? 'Add the units you use for items, for example KG, LITER or PACKET.' : undefined
            }
            action={
              uoms.length === 0 ? (
                <Button variant="dark" size="sm" onClick={() => setDialog({ mode: 'create' })}>
                  <PlusIcon className="h-4 w-4" />
                  New unit
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <UomTable
              uoms={filteredUoms}
              onEdit={uom => setDialog({ mode: 'edit', uom })}
              onToggleActive={uom => void handleToggleActive(uom)}
              togglingId={togglingId}
            />
            <p className="text-xs text-ink-muted">{uoms.length} units</p>
          </>
        )
      ) : null}

      {dialog ? (
        <UomFormDialog
          open
          mode={dialog.mode}
          initialValues={dialog.uom}
          submitting={submitting}
          serverError={serverError}
          serverFieldErrors={fieldErrors}
          onSubmit={values => void handleSubmit(values)}
          onClose={closeDialog}
        />
      ) : null}
    </div>
  );
}
