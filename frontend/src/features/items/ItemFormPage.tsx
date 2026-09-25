import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Card, ErrorState } from '../../design-system/components';
import { useDevSession } from '../../lib/session';
import { ApiError } from '../../lib/api-client';
import { createItem, updateItem } from './api';
import { sessionItemCache } from './session-cache';
import { ItemForm } from './components/ItemForm';
import type { Item, ItemInput } from './types';
import type { ItemFieldErrors } from './validation';

interface EditLocationState {
  item?: Item;
}

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
  const location = useLocation();
  const navigate = useNavigate();
  const { canEditItems } = useDevSession();

  const existingItem =
    mode === 'edit'
      ? ((location.state as EditLocationState | null)?.item ?? (id ? sessionItemCache.findById(id) : undefined))
      : undefined;

  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<ItemFieldErrors>();

  if (!canEditItems) {
    return (
      <Card>
        <ErrorState
          title="Not permitted"
          message="Only Owner or Manager can create or edit items (INV-11). Switch your dev identity in the header to try this screen."
        />
      </Card>
    );
  }

  if (mode === 'edit' && !existingItem) {
    return (
      <Card>
        <ErrorState
          title="Item not available for editing"
          message="The stable backend has no get-by-id endpoint for items yet, so this screen can only edit an item that's already in your current list view — open it from the Item list right after creating or editing it."
        />
      </Card>
    );
  }

  async function handleSubmit(values: ItemInput) {
    setSubmitting(true);
    setServerError(undefined);
    setFieldErrors(undefined);
    try {
      const saved = mode === 'create' ? await createItem(values) : await updateItem(existingItem!.id, values);
      sessionItemCache.upsert(saved);
      navigate('/items', {
        state: {
          successMessage: mode === 'create' ? `Item ${saved.item_code} created.` : `Item ${saved.item_code} updated.`,
        },
      });
    } catch (err) {
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
      setSubmitting(false);
    }
  }

  return (
    <Card title={mode === 'create' ? 'New item' : `Edit ${existingItem?.item_code}`}>
      <ItemForm
        key={id ?? 'new'}
        mode={mode}
        initialValues={existingItem}
        submitting={submitting}
        serverError={serverError}
        serverFieldErrors={fieldErrors}
        onSubmit={values => void handleSubmit(values)}
        onCancel={() => navigate('/items')}
      />
    </Card>
  );
}
