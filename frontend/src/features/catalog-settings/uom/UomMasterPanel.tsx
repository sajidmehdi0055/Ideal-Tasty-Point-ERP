import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  SearchField,
  LoadingState,
  ErrorState,
  EmptyState,
  Button,
  PageIntro,
  useToast,
} from '../../../design-system/components';
import {
  ColumnsMenu,
  DataTableToolbar,
  DensityToggle,
  ResultCount,
  useSlashFocus,
  useTableSettings,
} from '../../../design-system/data-table';
import { PlusIcon } from '../../../design-system/icons';
import { ApiError } from '../../../lib/api-client';
import { listUoms, createUom, updateUom } from './api';
import { UOM_COLUMNS, UomTable } from './UomTable';
import { UomFormDialog } from './UomFormDialog';
import { UNIT_TYPE_LABELS, type Uom, type UomInput } from './types';
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

interface UomMasterPanelProps {
  /** Catalog Settings tab strip, shown at the top of the table card. */
  tabs?: ReactNode;
}

export function UomMasterPanel({ tabs }: UomMasterPanelProps = {}) {
  const toast = useToast();
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [togglingId, setTogglingId] = useState<string>();
  const [toggleError, setToggleError] = useState<string>();

  const [dialog, setDialog] = useState<{ mode: 'create' | 'edit'; uom?: Uom } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<UomFieldErrors>();

  const settings = useTableSettings('uom', UOM_COLUMNS);
  const searchRef = useRef<HTMLInputElement>(null);
  useSlashFocus(searchRef, { onClear: () => setSearch('') });

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
        const created = await createUom(values);
        toast.success({
          title: 'Unit created',
          detail: `${created.name} was added as a ${UNIT_TYPE_LABELS[created.unit_type].toLowerCase()} unit.`,
        });
      } else {
        const updated = await updateUom(dialog.uom!.id, values);
        toast.success({ title: 'Unit updated', detail: `${updated.name} was saved.` });
      }
      closeDialog();
      setReloadToken(token => token + 1);
    } catch (err) {
      // Dialog errors stay inline in the dialog (never a toast).
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
    setToggleError(undefined);
    try {
      await updateUom(uom.id, { active: !uom.active });
      toast.success(
        uom.active
          ? { title: 'Unit deactivated', detail: `${uom.name} is now inactive.` }
          : { title: 'Unit activated', detail: `${uom.name} is now active.` },
      );
      setReloadToken(token => token + 1);
    } catch (err) {
      setToggleError(
        `Couldn't ${uom.active ? 'deactivate' : 'activate'} ${uom.name}: ${
          err instanceof ApiError ? describeUomError(err) : 'something went wrong.'
        }`,
      );
    } finally {
      setTogglingId(undefined);
    }
  }

  const openCreate = () => setDialog({ mode: 'create' });
  const searching = search.trim() !== '';
  const countText = searching ? `${filteredUoms.length} of ${uoms.length} units` : `${uoms.length} units`;

  return (
    <div className="flex flex-col gap-4">
      <PageIntro
        title="Units of measure"
        description="Units used for item base units, pack sizes and stock quantities. Names are unique."
        actions={
          <Button variant="primary" onClick={openCreate}>
            <PlusIcon className="h-4 w-4" />
            New unit
          </Button>
        }
      />

      <div className="rounded-card border border-line bg-canvas shadow-card">
        {tabs}
        <DataTableToolbar
          start={
            <SearchField
              ref={searchRef}
              shortcutHint="/"
              label="Search units by name"
              placeholder="Search units"
              value={search}
              onChange={event => setSearch(event.target.value)}
              onClear={() => setSearch('')}
              className="w-full max-w-xs"
            />
          }
          end={
            <>
              {status === 'live' ? <ResultCount>{countText}</ResultCount> : null}
              <ColumnsMenu settings={settings} />
              <DensityToggle settings={settings} />
            </>
          }
        />

        {toggleError ? (
          <p role="alert" className="mx-4 mb-3 rounded-control bg-danger-50 px-3.5 py-2.5 text-[13px] font-medium text-danger-700">
            {toggleError}
          </p>
        ) : null}

        {status === 'loading' ? <LoadingState label="Loading units…" /> : null}

        {status === 'error' ? <ErrorState message={error} onRetry={() => setReloadToken(token => token + 1)} /> : null}

        {status === 'live' ? (
          filteredUoms.length === 0 ? (
            <EmptyState
              title={uoms.length === 0 ? 'No UOMs yet' : 'No units match your search'}
              message={
                uoms.length === 0
                  ? 'Add the units you use for items, for example KG, LITER or PACKET.'
                  : 'Check the spelling or clear the search.'
              }
              action={
                uoms.length === 0 ? (
                  <Button variant="primary" size="sm" onClick={openCreate}>
                    <PlusIcon className="h-4 w-4" />
                    New unit
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <UomTable
              uoms={filteredUoms}
              settings={settings}
              onEdit={uom => setDialog({ mode: 'edit', uom })}
              onToggleActive={uom => void handleToggleActive(uom)}
              togglingId={togglingId}
            />
          )
        ) : null}
      </div>

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
