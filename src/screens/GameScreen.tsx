import { DrawerNavigationProp } from '@react-navigation/drawer';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { JSX, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    createNewGame,
    getGame,
    loadCurrentGameId,
    loadSettings,
    saveCurrentGameId,
    saveGame,
} from '../services/storage';
import { Game, Round } from '../types/game';
import {
    calculateCumulativeScore,
    calculateMissingScore,
    canAutoComplete,
    findMissingPlayer,
    roundToTwo,
} from '../utils/ScoreCalculator';

type RootDrawerParamList = {
    Game: { gameId: string } | undefined;
    History: undefined;
    Settings: undefined;
};

type GameRoute = RouteProp<RootDrawerParamList, 'Game'>;

const createEmptyRound = (players: string[]): Round => ({
    scores: players.map((playerName) => ({ playerName, score: null })),
});

const withTrailingRound = (rounds: Round[], players: string[]): Round[] => {
    if (rounds.length === 0) return [createEmptyRound(players)];
    const last = rounds[rounds.length - 1];
    if (last.scores.some((s) => s.score !== null)) {
        return [...rounds, createEmptyRound(players)];
    }
    return rounds;
};

export const GameScreen = (): JSX.Element => {
    const route = useRoute<GameRoute>();
    const navigation = useNavigation<DrawerNavigationProp<RootDrawerParamList>>();

    const [game, setGame] = useState<Game | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [promptVisible, setPromptVisible] = useState(false);
    const [promptInput, setPromptInput] = useState('100');
    const [editingPlayerIndex, setEditingPlayerIndex] = useState<number | null>(null);
    const [editingPlayerValue, setEditingPlayerValue] = useState('');

    const players = useMemo(() => (game ? Array.from(game.players) : []), [game]);

    useEffect(() => {
        const boot = async () => {
            setIsLoading(true);

            if (route.params?.gameId) {
                const fromStorage = await getGame(route.params.gameId);
                setGame(fromStorage);
                await saveCurrentGameId(route.params.gameId);
                setIsLoading(false);
                return;
            }

            const currentId = await loadCurrentGameId();
            if (!currentId) {
                setGame(null);
                setIsLoading(false);
                return;
            }

            const fromStorage = await getGame(currentId);
            setGame(fromStorage);
            setIsLoading(false);
        };

        void boot();
    }, [route.params?.gameId]);

    useLayoutEffect(() => {
        navigation.setOptions({
            headerRight: () => (
                <Pressable
                    style={({ pressed }) => [
                        styles.headerButton,
                        pressed && styles.headerButtonPressed,
                    ]}
                    onPress={() => {
                        Alert.alert(
                            'Nouvelle partie',
                            "Créer une nouvelle partie ? La partie actuelle reste dans l'historique.",
                            [
                                { text: 'Annuler', style: 'cancel' },
                                { text: 'Confirmer', onPress: () => void createFreshGame() },
                            ],
                        );
                    }}
                >
                    <Text style={styles.headerButtonText}>Nouvelle partie</Text>
                </Pressable>
            ),
        });
    }, [navigation]);

    const persistGame = async (nextGame: Game) => {
        setGame(nextGame);
        await saveGame(nextGame);
        await saveCurrentGameId(nextGame.id);
    };

    const createFreshGame = async () => {
        setIsCreating(true);
        const next = createNewGame();
        await saveGame(next);
        await saveCurrentGameId(next.id);
        setGame(next);
        setIsCreating(false);
    };

    const updateScore = async (roundIndex: number, playerIndex: number, textValue: string) => {
        if (!game) return;

        const parsed = textValue.trim() === '' ? null : Number(textValue.replace(',', '.'));
        const normalized = parsed !== null && Number.isFinite(parsed) ? parsed : null;

        const updatedRounds = game.rounds.map((round, idx) => {
            if (idx !== roundIndex) return round;
            return {
                scores: round.scores.map((score, scoreIdx) =>
                    scoreIdx === playerIndex ? { ...score, score: normalized } : score,
                ),
            };
        });

        await persistGame({
            ...game,
            rounds: withTrailingRound(updatedRounds, players),
        });
    };

    const startEditingPlayer = (playerIndex: number) => {
        setEditingPlayerIndex(playerIndex);
        setEditingPlayerValue(players[playerIndex]);
    };

    const cancelEditingPlayer = () => {
        setEditingPlayerIndex(null);
        setEditingPlayerValue('');
    };

    const savePlayerName = async (playerIndex: number) => {
        if (!game) return;

        const trimmed = editingPlayerValue.trim();
        const oldName = players[playerIndex];

        if (!trimmed) {
            Alert.alert('Pseudo invalide', 'Le pseudo ne peut pas être vide.');
            return;
        }

        if (trimmed === oldName) {
            cancelEditingPlayer();
            return;
        }

        // Vérification des doublons (sensible à la casse)
        if (players.some((name, idx) => idx !== playerIndex && name === trimmed)) {
            Alert.alert('Pseudo déjà utilisé', 'Ce pseudo existe déjà.');
            return;
        }

        const newPlayers = [...players];
        newPlayers[playerIndex] = trimmed;

        const newRounds = game.rounds.map((round) => ({
            scores: round.scores.map((score, idx) =>
                idx === playerIndex ? { ...score, playerName: trimmed } : score,
            ),
        }));

        await persistGame({
            ...game,
            players: new Set(newPlayers),
            rounds: newRounds,
        });

        cancelEditingPlayer();
    };

    const addPlayer = async () => {
        if (!game) return;

        let idx = players.length + 1;
        let nameCandidate = `Joueur ${idx}`;
        while (players.includes(nameCandidate)) {
            idx += 1;
            nameCandidate = `Joueur ${idx}`;
        }

        const newPlayers = [...players, nameCandidate];
        const newRounds = game.rounds.map((round) => ({
            scores: [...round.scores, { playerName: nameCandidate, score: null }],
        }));

        await persistGame({
            ...game,
            players: new Set(newPlayers),
            rounds: newRounds,
        });
    };

    const removePlayer = (playerIndex: number) => {
        if (!game || players.length <= 1) return;

        Alert.alert(
            'Supprimer le joueur',
            `Voulez-vous vraiment supprimer ${players[playerIndex]} ?`,
            [
                { text: 'Annuler', style: 'cancel' },
                {
                    text: 'Supprimer',
                    style: 'destructive',
                    onPress: () => {
                        void (async () => {
                            const newPlayers = players.filter((_, idx) => idx !== playerIndex);
                            const newRounds = game.rounds.map((round) => ({
                                scores: round.scores.filter((_, idx) => idx !== playerIndex),
                            }));

                            await persistGame({
                                ...game,
                                players: new Set(newPlayers),
                                rounds: newRounds,
                            });
                        })();
                    },
                },
            ],
        );
    };

    const completableRoundIndex = useMemo(() => {
        if (!game) return -1;
        for (let i = game.rounds.length - 1; i >= 0; i--) {
            const hasScore = game.rounds[i].scores.some((s) => s.score !== null);
            if (hasScore && canAutoComplete(game.rounds[i], players.length)) {
                return i;
            }
        }
        return -1;
    }, [game, players.length]);

    const runAutoComplete = async (targetTotal: number) => {
        if (!game || completableRoundIndex < 0) return;

        const targetRound = game.rounds[completableRoundIndex];
        const missingPlayerIndex = findMissingPlayer(targetRound);
        if (missingPlayerIndex === -1) return;

        const missingScore = roundToTwo(calculateMissingScore(targetRound, targetTotal));
        const updatedRounds = game.rounds.map((round, idx) => {
            if (idx !== completableRoundIndex) return round;
            return {
                scores: round.scores.map((score, scoreIdx) =>
                    scoreIdx === missingPlayerIndex ? { ...score, score: missingScore } : score,
                ),
            };
        });

        await persistGame({
            ...game,
            rounds: withTrailingRound(updatedRounds, players),
        });
    };

    const handleAutoComplete = async () => {
        const settings = await loadSettings();

        if (settings.autoCompleteMode === 'fixed') {
            await runAutoComplete(settings.fixedTotal);
            return;
        }

        setPromptInput(String(settings.fixedTotal));
        setPromptVisible(true);
    };

    const submitPromptAutoComplete = async () => {
        const parsed = Number(promptInput.replace(',', '.'));
        if (!Number.isFinite(parsed)) {
            Alert.alert('Montant invalide', 'Entrez un nombre valide.');
            return;
        }
        setPromptVisible(false);
        await runAutoComplete(parsed);
    };

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator />
            </View>
        );
    }

    if (!game) {
        return (
            <View style={styles.emptyContainer}>
                <View style={styles.placeholderCircle}>
                    <Text style={styles.placeholderIcon}>#</Text>
                </View>
                <Text style={styles.emptyTitle}>Commencez une nouvelle partie</Text>
                <Pressable
                    style={({ pressed }) => [
                        styles.createButton,
                        pressed && styles.createButtonPressed,
                    ]}
                    onPress={() => void createFreshGame()}
                    disabled={isCreating}
                >
                    {isCreating ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.createButtonText}>Créer une partie</Text>
                    )}
                </Pressable>
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.screen}>
            <View style={styles.quickActions}>
                <Pressable
                    style={[
                        styles.quickButton,
                        completableRoundIndex < 0 && styles.quickButtonDisabled,
                    ]}
                    onPress={() => void handleAutoComplete()}
                    disabled={completableRoundIndex < 0}
                >
                    <Text style={styles.quickButtonText}>Compléter</Text>
                </Pressable>
            </View>

            <ScrollView
                horizontal
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.tableWrapper}
            >
                <View>
                    <View style={styles.headerRow}>
                        <View style={[styles.headerCell, styles.roundHeaderCell]}>
                            <Text style={styles.headerText}>Manche</Text>
                        </View>
                        {players.map((playerName, playerIndex) => {
                            const isEditing = editingPlayerIndex === playerIndex;
                            const canValidate =
                                editingPlayerValue.trim().length > 0 &&
                                !players.some(
                                    (name, idx) =>
                                        idx !== playerIndex && name === editingPlayerValue.trim(),
                                );

                            return (
                                <View key={playerIndex} style={styles.headerCell}>
                                    <View style={styles.playerHeaderRow}>
                                        <TextInput
                                            style={styles.playerNameInput}
                                            value={isEditing ? editingPlayerValue : playerName}
                                            onChangeText={setEditingPlayerValue}
                                            onFocus={() => startEditingPlayer(playerIndex)}
                                            placeholder="Pseudo"
                                        />
                                        {isEditing && (
                                            <Pressable
                                                style={[
                                                    styles.validateButton,
                                                    !canValidate && styles.validateButtonDisabled,
                                                ]}
                                                onPress={() => void savePlayerName(playerIndex)}
                                                disabled={!canValidate}
                                            >
                                                <Text style={styles.validateButtonText}>✓</Text>
                                            </Pressable>
                                        )}
                                    </View>
                                    {players.length > 1 && (
                                        <Pressable onPress={() => void removePlayer(playerIndex)}>
                                            <Text style={styles.deleteText}>Suppr.</Text>
                                        </Pressable>
                                    )}
                                </View>
                            );
                        })}
                        <View style={styles.addPlayerCell}>
                            <Pressable
                                style={({ pressed }) => [
                                    styles.addPlayerButton,
                                    pressed && styles.addPlayerButtonPressed,
                                ]}
                                onPress={() => void addPlayer()}
                            >
                                <Text style={styles.addPlayerButtonText}>+</Text>
                            </Pressable>
                        </View>
                    </View>

                    <ScrollView keyboardShouldPersistTaps="handled" style={styles.verticalArea}>
                        {game.rounds.map((round, roundIndex) => (
                            <View key={roundIndex} style={styles.dataRow}>
                                <View style={[styles.roundCell, styles.roundHeaderCell]}>
                                    <Text style={styles.roundText}>{roundIndex + 1}</Text>
                                </View>
                                {players.map((playerName, playerIndex) => {
                                    const scoreValue = round.scores[playerIndex]?.score;
                                    const displayScore =
                                        scoreValue === null ? '' : String(scoreValue);
                                    const cumulative = calculateCumulativeScore(
                                        game.rounds,
                                        playerIndex,
                                        roundIndex,
                                    );

                                    return (
                                        <View key={playerIndex} style={styles.scoreCell}>
                                            <TextInput
                                                style={styles.scoreInput}
                                                value={displayScore}
                                                onChangeText={(value) =>
                                                    void updateScore(roundIndex, playerIndex, value)
                                                }
                                                keyboardType="decimal-pad"
                                                placeholder="0"
                                            />
                                            <Text style={styles.cumulativeText}>
                                                Cumul: {roundToTwo(cumulative)}
                                            </Text>
                                        </View>
                                    );
                                })}
                                <View style={styles.addPlayerSpacer} />
                            </View>
                        ))}
                    </ScrollView>
                </View>
            </ScrollView>

            <Modal
                visible={promptVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setPromptVisible(false)}
            >
                <View style={styles.modalBackdrop}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Montant à compléter</Text>
                        <TextInput
                            value={promptInput}
                            onChangeText={setPromptInput}
                            keyboardType="decimal-pad"
                            style={styles.modalInput}
                        />
                        <View style={styles.modalActions}>
                            <Pressable
                                style={styles.modalButtonSecondary}
                                onPress={() => setPromptVisible(false)}
                            >
                                <Text style={styles.modalButtonSecondaryText}>Annuler</Text>
                            </Pressable>
                            <Pressable
                                style={styles.modalButtonPrimary}
                                onPress={() => void submitPromptAutoComplete()}
                            >
                                <Text style={styles.modalButtonPrimaryText}>Valider</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#fff' },
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        backgroundColor: '#f4f6fb',
    },
    placeholderCircle: {
        width: 88,
        height: 88,
        borderRadius: 44,
        backgroundColor: '#d9e0f7',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 18,
    },
    placeholderIcon: { fontSize: 34, fontWeight: '700', color: '#3b4a77' },
    emptyTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: '#1f2840',
        textAlign: 'center',
        marginBottom: 18,
    },
    createButton: {
        backgroundColor: '#1f6feb',
        borderRadius: 10,
        paddingHorizontal: 20,
        paddingVertical: 12,
        minWidth: 210,
        alignItems: 'center',
    },
    createButtonPressed: { opacity: 0.85 },
    createButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    quickActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#e2e8f8',
        backgroundColor: '#f8faff',
    },
    quickButton: {
        backgroundColor: '#2c6edf',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
    },
    quickButtonDisabled: { opacity: 0.4 },
    quickButtonText: { color: '#fff', fontWeight: '600' },
    headerButton: {
        marginRight: 10,
        backgroundColor: '#1f6feb',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    headerButtonPressed: { opacity: 0.85 },
    headerButtonText: { color: '#fff', fontSize: 11, fontWeight: '700' },
    tableWrapper: { paddingBottom: 20 },
    headerRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#d7def1',
        backgroundColor: '#f5f8ff',
    },
    headerCell: {
        width: 170,
        minHeight: 68,
        borderRightWidth: 1,
        borderRightColor: '#d7def1',
        padding: 8,
        justifyContent: 'center',
    },
    roundHeaderCell: { width: 82 },
    headerText: { fontWeight: '700', color: '#1d2a4f' },
    playerNameInput: {
        borderWidth: 1,
        borderColor: '#c7d0ea',
        borderRadius: 7,
        paddingHorizontal: 8,
        paddingVertical: 5,
        marginBottom: 4,
        fontSize: 14,
        flex: 1,
    },
    playerHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    validateButton: {
        backgroundColor: '#1f6feb',
        borderRadius: 999,
        width: 28,
        height: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    validateButtonDisabled: { opacity: 0.35 },
    validateButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    addPlayerCell: {
        width: 46,
        minHeight: 68,
        alignItems: 'center',
        justifyContent: 'center',
        borderRightWidth: 1,
        borderRightColor: '#d7def1',
    },
    addPlayerSpacer: { width: 46, borderRightWidth: 1, borderRightColor: '#ecf0fb' },
    addPlayerButton: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1f6feb',
    },
    addPlayerButtonPressed: { opacity: 0.8 },
    addPlayerButtonText: { color: '#fff', fontSize: 20, fontWeight: '700' },
    deleteText: { color: '#b02a2a', fontSize: 12 },
    verticalArea: { maxHeight: '100%' },
    dataRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#ecf0fb' },
    roundCell: {
        width: 82,
        borderRightWidth: 1,
        borderRightColor: '#ecf0fb',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fbfcff',
    },
    roundText: { fontWeight: '700', color: '#30406b' },
    scoreCell: { width: 170, borderRightWidth: 1, borderRightColor: '#ecf0fb', padding: 8 },
    scoreInput: {
        borderWidth: 1,
        borderColor: '#c7d0ea',
        borderRadius: 7,
        paddingHorizontal: 8,
        paddingVertical: 6,
        fontSize: 15,
        marginBottom: 6,
    },
    cumulativeText: { fontSize: 12, color: '#526087' },
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.35)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    modalCard: {
        width: '100%',
        maxWidth: 340,
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
    },
    modalTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10, color: '#1d2a4f' },
    modalInput: {
        borderWidth: 1,
        borderColor: '#c7d0ea',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
        marginBottom: 14,
    },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
    modalButtonSecondary: {
        paddingVertical: 9,
        paddingHorizontal: 14,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#c7d0ea',
    },
    modalButtonSecondaryText: { color: '#2f3d63', fontWeight: '600' },
    modalButtonPrimary: {
        backgroundColor: '#2c6edf',
        paddingVertical: 9,
        paddingHorizontal: 14,
        borderRadius: 8,
    },
    modalButtonPrimaryText: { color: '#fff', fontWeight: '700' },
});
