import { Alert } from 'react-native';

export function handleMutationError(error: any, context: string) {
  const status = error?.status || error?.response?.status;

  if (status === 409) {
    Alert.alert('Conflict', 'This was updated by someone else. Refreshing to show latest data.');
    return;
  }
  if (status === 422) {
    Alert.alert('Validation Error', error?.message || 'Please check your input.');
    return;
  }
  Alert.alert(`${context} Failed`, error?.message || 'Please check your connection and try again.');
}
