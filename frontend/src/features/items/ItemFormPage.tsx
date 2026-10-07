import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, ErrorState, LoadingState, NoAccessState, useToast } from '../../design-system/components';
import { useDevSession } from '../../lib/session';
import { ApiError } from '../../lib/api-client';
import { createItem, getItem, updateItem } from './api';
import { ItemForm } from './components/ItemForm';
import type { Item, ItemInput } from './types';
import type { ItemFieldErrors } from './validation';

/** The item form stays a full page (not a dialog), capped to a readable width. */
const FORM_WIDTH = 'w-full max-w-2xl';

type LoadStatus ='idle' | 'loading' | 'loaded' | 'error';

function describeItemError(error: ApiError): string {
  if (error.status === 401) {
    return 'Not signed in — sign-in is not implemented yet. This is expected until the login/session system ships.';
  }
  if (error.status === 403) {
    return "Your current dev role doesn't have permission — only Owner or Manager can create or edit items (INV-11).";
  }
  if (error.status === 404) return 'Item not found for your branch.';
  return error.message;
}

export function ItemFormPage() {
  const { id } = useParams<{ id: string }>();
  const mode: 'create' | 'edit' = id ? 'edit' : 'create';
  const navigate = useNavigate();
  const { canEditItems } = useDevSession();
  const toast = useToast();

  const [item, setItem] = useState<Item | undefined>(undefined);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>(mode === 'edit' ? 'loading' : 'idle');
  const [loadError, setLoadError] = useState<ApiError>();
  const [reloadToken, setReloadToken] = useState(0);

  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<ItemFieldErrors>();

  // Identifies the current route's edit target (mode + id). A save's async
  // callback captures this token and checks it before touching state/navigate,
  // so a stale response from a superseded route can never affect what the
  // user is now looking at (edit->new, edit A -> edit B, or unmount).
  const activeTokenRef = useRef<symbol | undefined>(undefined);

  useEffect(() => {
    const token = Symbol('item-form-route');
    activeTokenRef.current = token;
    let ignore = false;

    async function run() {
      // A new route target (including switching from a loaded edit page to
      // the create page) must never keep the previous target's item/form state.
      setItem(undefined);
      setLoadError(undefined);
      setServerError(undefined);
      setFieldErrors(undefined);
      setSubmitting(false);

      if (mode !== 'edit' || !id || !canEditItems) {
        setLoadStatus('idle');
        return;
      }

      setLoadStatus('loading');
      try {
        const fetched = await getItem(id!);
        if (ignore) return;
        setItem(fetched);
        setLoadStatus('loaded');
      } catch (err) {
        if (ignore) return;
        setLoadError(err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN_ERROR', 'Something went wrong.'));
        setLoadStatus('error');
      }
    }

    void run();
    return () => {
      ignore = true;
      if (activeTokenRef.current === token) activeTokenRef.current = undefined;
    };
  }, [mode, id, reloadToken, canEditItems]);

  if (!canEditItems) {
    return (
      <NoAccessState
        title="Not permitted"
        who="Owner or Manager"
        message="Only Owner or Manager can create or edit items. Switch your dev identity in the header to try this screen."
      />
    );
  }

  if (mode === 'edit' && loadStatus === 'loading') {
    return (
      <Card className={FORM_WIDTH}>
        <LoadingState label="Loading item…" />
      </Card>
    );
  }

  if (mode === 'edit' && loadStatus === 'error') {
    return (
      <Card className={FORM_WIDTH}>
        <ErrorState
          message={loadError ? describeItemError(loadError) : 'Something went wrong.'}
          onRetry={() => setReloadToken(token => token + 1)}
        />
      </Card>
    );
  }

  async function handleSubmit(values: ItemInput) {
    const token = activeTokenRef.current;
    setSubmitting(true);
    setServerError(undefined);
    setFieldErrors(undefined);
    try {
      const saved = mode === 'create' ? await createItem(values) : await updateItem(item!.id, values);
      // The route may have changed (or the page unmounted) while this request
      // was in flight. A late success must never redirect whatever the user
      // is now looking at.
      if (activeTokenRef.current !== token) return;
      toast.success(
        mode === 'create'
          ? { title: 'Item created', detail: `${saved.item_name} was added as ${saved.item_code}.` }
          : { title: 'Item updated', detail: `${saved.item_name} (${saved.item_code}) was saved.` },
      );
      navigate('/items');
    } catch (err) {
      // Same guard for a late failure: it belongs to a superseded route and
      // must not surface as an error on the page the user has since moved to.
      if (activeTokenRef.current !== token) return;
      if (err instanceof ApiError && err.code === 'VALIDATION_ERROR' && err.issues) {
        const mapped: ItemFieldErrors = {};
        for (const issue of err.issues) {
          const field = issue.path[0];
          if (typeof field === 'string') mapped[field as keyof ItemFieldErrors] = issue.message;
        }
        setFieldErrors(mapped);
        setServerError('Please fix the highlighted fields.');
      } else if (err instanceof ApiError && err.code === 'INVALID_BASE_UOM') {
        setFieldErrors({ base_uom: 'This unit is not an active unit in UOM Master.' });
        setServerError('Please fix the highlighted fields.');
      } else if (err instanceof ApiError) {
        setServerError(describeItemError(err));
      } else {
        setServerError('Something went wrong.');
      }
    } finally {
      if (activeTokenRef.current === token) setSubmitting(false);
    }
  }

  return (
    <Card title={mode === 'create' ? 'New item' : `Edit ${item?.item_code}`} className={FORM_WIDTH}>
      {mode === 'create' || (mode === 'edit' && loadStatus === 'loaded') ? (
        <ItemForm
          key={mode === 'create' ? 'create' : id}
          mode={mode}
          initialValues={mode === 'create' ? undefined : item}
          submitting={submitting}
          serverError={serverError}
          serverFieldErrors={fieldErrors}
          onSubmit={values => void handleSubmit(values)}
          onCancel={() => navigate('/items')}
        />
      ) : null}
    </Card>
  );
}
