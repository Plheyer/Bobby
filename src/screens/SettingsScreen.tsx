import { JSX, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getSettingsDefaults, loadSettings, saveSettings } from '../services/storage';
import { Settings } from '../types/game';

export const SettingsScreen = (): JSX.Element => {
    const [settings, setSettings] = useState<Settings>(getSettingsDefaults());
    const [fixedTotalInput, setFixedTotalInput] = useState('100');

    useEffect(() => {
        const fetchSettings = async () => {
            const loaded = await loadSettings();
            setSettings(loaded);
            setFixedTotalInput(String(loaded.fixedTotal));
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

    return (
        <SafeAreaView style={styles.container}>
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
                onBlur={handleFixedTotalBlur}
                keyboardType="decimal-pad"
                style={styles.input}
                placeholder="100"
                editable={settings.autoCompleteMode === 'fixed'}
            />
            <Text style={styles.hint}>
                Utilisé quand le mode est fixe. En mode demandé, ce montant reste disponible comme
                base.
            </Text>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff', padding: 16 },
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
