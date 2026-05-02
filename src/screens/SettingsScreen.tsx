import { useNavigation } from '@react-navigation/native';
import { JSX, useEffect, useLayoutEffect, useState } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    useWindowDimensions,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getSettingsDefaults, loadSettings, saveSettings } from '../services/storage';
import { Settings } from '../types/game';

export const SettingsScreen = (): JSX.Element => {
    const navigation = useNavigation();
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const isLandscape = windowWidth > windowHeight;
    const [focusedInputCount, setFocusedInputCount] = useState(0);

    useLayoutEffect(() => {
        // mirror GameScreen: hide header while any input is focused
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        navigation.setOptions({ headerShown: focusedInputCount === 0 });
    }, [navigation, focusedInputCount]);
    const [settings, setSettings] = useState<Settings>(getSettingsDefaults());
    const [fixedTotalInput, setFixedTotalInput] = useState('100');
    const [nullosInput, setNullosInput] = useState('Le nullos dernier');
    const [kingInput, setKingInput] = useState('Puis le king');

    useEffect(() => {
        const fetchSettings = async () => {
            const loaded = await loadSettings();
            setSettings(loaded);
            setFixedTotalInput(String(loaded.fixedTotal));
            setNullosInput(loaded.nullosLabel || 'Le nullos dernier');
            setKingInput(loaded.kingLabel || 'Puis le king');
        };
        void fetchSettings();
    }, []);

    const updateSettings = async (next: Settings) => {
        setSettings(next);
        await saveSettings(next);
    };

    const handleModeChange = (mode: 'fixed' | 'prompt') => {
        void updateSettings({ ...settings, autoCompleteMode: mode });
    };

    const handleFixedTotalBlur = () => {
        const parsed = Number(fixedTotalInput);
        const nextTotal = Number.isFinite(parsed) ? parsed : 100;
        setFixedTotalInput(String(nextTotal));
        void updateSettings({ ...settings, fixedTotal: nextTotal });
    };

    const handleNullosBlur = () => {
        const next = nullosInput.trim() || 'Le nullos dernier';
        setNullosInput(next);
        void updateSettings({ ...settings, nullosLabel: next });
    };

    const handleKingBlur = () => {
        const next = kingInput.trim() || 'Puis le king';
        setKingInput(next);
        void updateSettings({ ...settings, kingLabel: next });
    };

    const handleScoreOrderChange = (scoreOrder: 'highest-wins' | 'lowest-wins') => {
        void updateSettings({ ...settings, scoreOrder });
    };

    const onInputFocus = () => setFocusedInputCount((c) => c + 1);
    const onInputBlur = () => setFocusedInputCount((c) => Math.max(0, c - 1));

    return (
        <SafeAreaView
            style={styles.container}
            edges={focusedInputCount > 0 ? ['top', 'bottom', 'left', 'right'] : ['bottom', 'left', 'right']}
        >
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <ScrollView
                    contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
                    keyboardShouldPersistTaps="handled"
                >
                    <Text style={styles.title}>Paramètres</Text>

                    <Text style={styles.label}>Mode auto-complétion</Text>
                    <View style={styles.modeRow}>
                <Pressable
                    style={[
                        styles.modeButton,
                        settings.autoCompleteMode === 'fixed' && styles.modeButtonActive,
                    ]}
                    onPress={() => handleModeChange('fixed')}
                >
                    <Text style={styles.modeButtonText}>Montant fixe</Text>
                </Pressable>
                <Pressable
                    style={[
                        styles.modeButton,
                        settings.autoCompleteMode === 'prompt' && styles.modeButtonActive,
                    ]}
                    onPress={() => handleModeChange('prompt')}
                >
                    <Text style={styles.modeButtonText}>Demandé à chaque fois</Text>
                </Pressable>
            </View>

            <Text style={styles.label}>Montant par défaut</Text>
            <TextInput
                value={fixedTotalInput}
                onChangeText={setFixedTotalInput}
                onFocus={onInputFocus}
                onBlur={() => {
                    onInputBlur();
                    handleFixedTotalBlur();
                }}
                keyboardType="decimal-pad"
                style={styles.input}
                placeholder="100"
                placeholderTextColor="#434343ff"
                editable={settings.autoCompleteMode === 'fixed'}
                disableFullscreenUI={true}
            />
            <Text style={styles.hint}>
                Utilisé quand le mode est fixe. En mode demandé, ce montant reste disponible comme
                base.
            </Text>

            <Text style={[styles.label, { marginTop: 18 }]}>Classement (TTS)</Text>
            <View style={styles.modeRow}>
                <Pressable
                    style={[
                        styles.modeButton,
                        settings.scoreOrder === 'highest-wins' && styles.modeButtonActive,
                    ]}
                    onPress={() => handleScoreOrderChange('highest-wins')}
                >
                    <Text style={styles.modeButtonText}>Plus de points = gagne</Text>
                </Pressable>
                <Pressable
                    style={[
                        styles.modeButton,
                        settings.scoreOrder === 'lowest-wins' && styles.modeButtonActive,
                    ]}
                    onPress={() => handleScoreOrderChange('lowest-wins')}
                >
                    <Text style={styles.modeButtonText}>Moins de points = gagne</Text>
                </Pressable>
            </View>

                    <Text style={[styles.label, { marginTop: 16 }]}>Texte TTS - Liste des perdants</Text>
                    <TextInput
                        value={nullosInput}
                        onChangeText={setNullosInput}
                        onFocus={onInputFocus}
                        onBlur={() => {
                            onInputBlur();
                            handleNullosBlur();
                        }}
                        style={styles.input}
                        placeholderTextColor="#434343ff"
                        disableFullscreenUI={true}
                    />

                    <Text style={[styles.label, { marginTop: 12 }]}>Texte TTS - Meilleur</Text>
                    <TextInput
                        value={kingInput}
                        onChangeText={setKingInput}
                        onFocus={onInputFocus}
                        onBlur={() => {
                            onInputBlur();
                            handleKingBlur();
                        }}
                        style={styles.input}
                        placeholderTextColor="#434343ff"
                        disableFullscreenUI={true}
                    />
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff', padding: 0 },
    title: { fontSize: 24, fontWeight: '700', marginBottom: 20, color: '#17223b' },
    label: { fontSize: 15, fontWeight: '600', marginBottom: 8, color: '#24345c' },
    modeRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
    modeButton: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#c7d0ea',
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 10,
        backgroundColor: '#f4f6ff',
    },
    modeButtonActive: { backgroundColor: '#dbe8ff', borderColor: '#638dde' },
    modeButtonText: { textAlign: 'center', fontWeight: '600', color: '#20345f', fontSize: 13 },
    input: {
        borderWidth: 1,
        borderColor: '#c7d0ea',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 15,
        color: '#10203f',
    },
    hint: { marginTop: 8, fontSize: 12, color: '#5b6790' },
});
