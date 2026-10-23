import React from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Height of the on-screen keyboard while it's up, else 0. The report sheet is a
 * transparent Modal: on Android (edge-to-edge) its window doesn't resize for the
 * keyboard, so the sheet lifts itself by this much to keep the note in view.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = React.useState(0);
  React.useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, (e) => setHeight(e.endCoordinates?.height ?? 0));
    const hide = Keyboard.addListener(hideEvt, () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}
