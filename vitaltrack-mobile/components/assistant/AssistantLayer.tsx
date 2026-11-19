import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, BackHandler, StyleSheet, View } from 'react-native';

type Layer = { owner: symbol; content: ReactNode; close: () => void };
const Context = createContext<{ show: (layer: Layer) => void; hide: (owner: symbol) => void } | null>(null);

/** An ordinary view inside the app window, not an Android Dialog or system overlay. */
export function AssistantLayerProvider({ children }: { children: ReactNode }) {
  const [layer, setLayer] = useState<Layer | null>(null);
  const [reduceMotion, setReduceMotion] = useState(true);
  const opacity = useRef(new Animated.Value(1)).current;
  const show = useCallback((next: Layer) => setLayer(next), []);
  const hide = useCallback((owner: symbol) => setLayer(old => old?.owner === owner ? null : old), []);
  const value = useMemo(() => ({ show, hide }), [show, hide]);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduceMotion(value); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { mounted = false; sub.remove(); };
  }, []);
  const owner = layer?.owner;
  useEffect(() => {
    if (!owner || reduceMotion) { opacity.setValue(1); return; }
    opacity.setValue(0);
    const animation = Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true });
    animation.start(); return () => animation.stop();
  }, [owner, reduceMotion, opacity]);
  useEffect(() => {
    if (!layer) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { layer.close(); return true; });
    return () => subscription.remove();
  }, [layer]);
  return <Context.Provider value={value}><View style={styles.root}>
    <View style={styles.root} pointerEvents={layer ? 'none' : 'auto'} importantForAccessibility={layer ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={!!layer}>{children}</View>
    {layer && <Animated.View testID="assistant-answer-layer" style={[StyleSheet.absoluteFill, { opacity }]} accessibilityViewIsModal>{layer.content}</Animated.View>}
  </View></Context.Provider>;
}

export function AssistantLayer({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  const host = useContext(Context);
  const owner = useRef(Symbol('assistant'));
  useLayoutEffect(() => {
    if (!host) return;
    if (visible) host.show({ owner: owner.current, content: children, close: onClose });
    else host.hide(owner.current);
  }, [host, visible, children, onClose]);
  useLayoutEffect(() => {
    const id = owner.current;
    return () => host?.hide(id);
  }, [host]);
  return !host && visible ? <View testID="assistant-answer-layer" style={StyleSheet.absoluteFill}>{children}</View> : null;
}

const styles = StyleSheet.create({ root: { flex: 1 } });
