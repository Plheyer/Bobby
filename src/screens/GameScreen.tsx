import { DrawerNavigationProp } from '@react-navigation/drawer';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { JSX, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Keyboard,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    useWindowDimensions,
    View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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

const parseScoreExpression = (value: string): number | null => {
    const normalized = value
        .trim()
        .replace(/\s+/g, '')
        .replace(/,/g, '.')
        .replace(/=/g, '');
    if (!normalized) return null;
    if (!/^[0-9+\-*/.]+$/.test(normalized)) return null;

    const tokens: Array<number | '+' | '-' | '*' | '/'> = [];
    let i = 0;
    let expectNumber = true;

    while (i < normalized.length) {
        const ch = normalized[i];

        if (expectNumber) {
            let sign = 1;
            if (ch === '-') {
                sign = -1;
                i += 1;
            } else if (ch === '+') {
                i += 1;
            }

            const start = i;
            let dotCount = 0;
            while (i < normalized.length) {
                const c = normalized[i];
                if (c >= '0' && c <= '9') {
                    i += 1;
                    continue;
                }
                if (c === '.') {
                    dotCount += 1;
                    if (dotCount > 1) return null;
                    i += 1;
                    continue;
                }
                break;
            }

            const raw = normalized.slice(start, i);
            if (!raw || raw === '.') return null;
            const parsed = Number(raw);
            if (!Number.isFinite(parsed)) return null;

            tokens.push(sign * parsed);
            expectNumber = false;
            continue;
        }

        if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
            tokens.push(ch);
            i += 1;
            expectNumber = true;
            continue;
        }

        return null;
    }

    if (expectNumber || tokens.length === 0) return null;

    const collapsed: Array<number | '+' | '-'> = [tokens[0] as number];
    for (let idx = 1; idx < tokens.length; idx += 2) {
        const op = tokens[idx] as '+' | '-' | '*' | '/';
        const right = tokens[idx + 1] as number;
        if (op === '*' || op === '/') {
            const left = collapsed[collapsed.length - 1] as number;
            if (op === '/' && right === 0) return null;
            collapsed[collapsed.length - 1] = op === '*' ? left * right : left / right;
        } else {
            collapsed.push(op, right);
        }
    }

    let result = collapsed[0] as number;
    for (let idx = 1; idx < collapsed.length; idx += 2) {
        const op = collapsed[idx] as '+' | '-';
        const right = collapsed[idx + 1] as number;
        result = op === '+' ? result + right : result - right;
    }

    if (!Number.isFinite(result)) return null;
    return roundToTwo(result);
};

const sanitizeScoreInput = (value: string): string => {
    return value.replace(/[^0-9+\-*/=.,]/g, '');
};

export const GameScreen = (): JSX.Element => {
    const route = useRoute<GameRoute>();
    const navigation = useNavigation<DrawerNavigationProp<RootDrawerParamList>>();
    const insets = useSafeAreaInsets();
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();

    const [game, setGame] = useState<Game | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [promptVisible, setPromptVisible] = useState(false);
    const [promptInput, setPromptInput] = useState('100');
    const [editingPlayerIndex, setEditingPlayerIndex] = useState<number | null>(null);
    const [editingPlayerValue, setEditingPlayerValue] = useState('');
    const [isAutoDeleting, setIsAutoDeleting] = useState(false);
    const [focusedInputCount, setFocusedInputCount] = useState(0);
    const [editingScoreCell, setEditingScoreCell] = useState<{ roundIndex: number; playerIndex: number } | null>(null);
    const [editingScoreValue, setEditingScoreValue] = useState('');
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const [keyboardTopY, setKeyboardTopY] = useState<number | null>(null);
    const [isSpeaking, setIsSpeaking] = useState(false);

    const players = useMemo(() => (game ? Array.from(game.players) : []), [game]);
    const keyboardOverlap = Math.max(
        keyboardHeight,
        keyboardTopY === null ? 0 : windowHeight - keyboardTopY,
    );
    const isLandscape = windowWidth > windowHeight;
    const androidBottomInset = Platform.OS === 'android' ? Math.max(insets.bottom, 24) : insets.bottom;
    const androidRightInset = Platform.OS === 'android' && isLandscape ? Math.max(insets.right, 24) : insets.right;
    const verticalFloatingPadding = isLandscape ? 12 : androidBottomInset + 12;
    const floatingButtonBottom =
        keyboardOverlap > 0 ? keyboardOverlap + verticalFloatingPadding : verticalFloatingPadding;
    const floatingButtonRight = androidRightInset + 12;

    useEffect(() => {
        const showSub = Keyboard.addListener('keyboardDidShow', (event) => {
            setKeyboardHeight(event.endCoordinates.height);
            setKeyboardTopY(event.endCoordinates.screenY);
        });
        const hideSub = Keyboard.addListener('keyboardDidHide', () => {
            setKeyboardHeight(0);
            setKeyboardTopY(null);
        });

        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

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
            headerShown: focusedInputCount === 0,
            headerRight: () => (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {focusedInputCount === 0 && (
                        <Pressable
                            style={({ pressed }) => [
                                styles.headerButton,
                                pressed && styles.headerButtonPressed,
                                isSpeaking && styles.headerButtonDisabled,
                                { marginRight: 8 },
                            ]}
                            disabled={isSpeaking}
                            onPress={() => {
                                if (isSpeaking) return;
                                if (!game) return;
                                setIsSpeaking(true);
                                const lastRoundIndex = game.rounds.length - 1;
                                const totals = game.players
                                    ? Array.from(game.players).map((p, idx) => ({
                                          name: p,
                                          total: calculateCumulativeScore(
                                              game.rounds,
                                              idx,
                                              lastRoundIndex,
                                          ),
                                      }))
                                    : [];
                                // sort by total ascending (worst to best)
                                totals.sort((a, b) => b.total - a.total);
                                if (totals.length === 0) {
                                    setIsSpeaking(false);
                                    return;
                                }
                                const parts = totals.map((t) => `${t.name} avec ${t.total}`);
                                if (parts.length > 0) parts.pop();
                                const best = totals[totals.length - 1];
                                const toSpeak = `Le nullos dernier : ${parts.join(
                                    ', ',
                                )}. Puis le king : ${best.name} avec ${best.total}`;
                                // @ts-ignore: optional dependency
                                import('expo-speech')
                                    .then((mod) => {
                                        try {
                                            mod.speak(toSpeak, {
                                                language: 'fr-FR',
                                                rate: 0.85,
                                                pitch: 0.6,
                                                onDone: () => setIsSpeaking(false),
                                                onError: () => setIsSpeaking(false),
                                            });
                                        } catch (e) {
                                            console.warn('TTS speak failed', e);
                                            setIsSpeaking(false);
                                        }
                                    })
                                    .catch(() => {
                                        console.warn('expo-speech not available');
                                        setIsSpeaking(false);
                                    });
                            }}
                        >
                            <Text style={styles.headerButtonText}>Classement</Text>
                        </Pressable>
                    )}
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
                </View>
            ),
        });
    }, [navigation, focusedInputCount, game, isSpeaking]);

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

        const normalized = parseScoreExpression(textValue);

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

    const hasAnyScore = (round: Round): boolean => {
        return round.scores.some((s) => s.score !== null);
    };

    const canDeleteLastRound = (): boolean => {
        if (!game || game.rounds.length <= 1) return false;
        const lastRound = game.rounds[game.rounds.length - 1];
        const secondToLastRound = game.rounds[game.rounds.length - 2];
        return !hasAnyScore(lastRound) && !hasAnyScore(secondToLastRound);
    };

    useEffect(() => {
        const autoDeleteLastRound = async () => {
            if (!game || isAutoDeleting) return;

            const shouldDelete = canDeleteLastRound();
            if (shouldDelete) {
                setIsAutoDeleting(true);
                const newRounds = game.rounds.slice(0, -1);
                await persistGame({
                    ...game,
                    rounds: newRounds,
                });
                setIsAutoDeleting(false);
            }
        };

        void autoDeleteLastRound();
    }, [game]);

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
        <>
            <SafeAreaView
                style={styles.screen}
                edges={focusedInputCount > 0 ? ['top', 'bottom', 'left', 'right'] : ['bottom', 'left', 'right']}
            >
                <ScrollView
                    horizontal
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.tableWrapper}
                >
                    <View style={styles.tableContent}>
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
                                                onFocus={() => {
                                                    setFocusedInputCount((current) => current + 1);
                                                    startEditingPlayer(playerIndex);
                                                }}
                                                onBlur={() =>
                                                    setFocusedInputCount((current) =>
                                                        Math.max(0, current - 1),
                                                    )
                                                }
                                                placeholder="Pseudo"
                                                disableFullscreenUI={true}
                                            />
                                            {isEditing && (
                                                <Pressable
                                                    style={[
                                                        styles.validateButton,
                                                        !canValidate &&
                                                            styles.validateButtonDisabled,
                                                    ]}
                                                    onPress={() => void savePlayerName(playerIndex)}
                                                    disabled={!canValidate}
                                                >
                                                    <Text style={styles.validateButtonText}>✓</Text>
                                                </Pressable>
                                            )}
                                        </View>
                                        {players.length > 1 && focusedInputCount === 0 && (
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

                        <ScrollView
                            keyboardShouldPersistTaps="handled"
                            style={styles.verticalArea}
                            contentContainerStyle={styles.verticalAreaContent}
                        >
                            {game.rounds.map((round, roundIndex) => (
                                <View key={roundIndex} style={styles.dataRow}>
                                    <View style={[styles.roundCell, styles.roundHeaderCell]}>
                                        <Text style={styles.roundText}>{roundIndex + 1}</Text>
                                    </View>
                                    {players.map((playerName, playerIndex) => {
                                        const scoreValue = round.scores[playerIndex]?.score;
                                        const isEditingScore =
                                            editingScoreCell?.roundIndex === roundIndex &&
                                            editingScoreCell?.playerIndex === playerIndex;
                                        const displayScore = isEditingScore
                                            ? editingScoreValue
                                            : scoreValue === null
                                              ? ''
                                              : String(scoreValue);
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
                                                    onChangeText={(value) => {
                                                        const sanitizedValue = sanitizeScoreInput(value);
                                                        setEditingScoreCell({
                                                            roundIndex,
                                                            playerIndex,
                                                        });
                                                        setEditingScoreValue(sanitizedValue);
                                                        if (
                                                            parseScoreExpression(sanitizedValue) !== null ||
                                                            sanitizedValue.trim() === ''
                                                        ) {
                                                            void updateScore(roundIndex, playerIndex, sanitizedValue);
                                                        }
                                                    }}
                                                    keyboardType="default"
                                                    autoCorrect={false}
                                                    placeholder="0"
                                                    disableFullscreenUI={true}
                                                    onFocus={() => {
                                                        setFocusedInputCount((current) => current + 1);
                                                        setEditingScoreCell({
                                                            roundIndex,
                                                            playerIndex,
                                                        });
                                                        setEditingScoreValue(displayScore);
                                                    }}
                                                    onBlur={() => {
                                                        setFocusedInputCount((current) =>
                                                            Math.max(0, current - 1),
                                                        );
                                                        if (
                                                            editingScoreCell?.roundIndex === roundIndex &&
                                                            editingScoreCell?.playerIndex === playerIndex
                                                        ) {
                                                            if (
                                                                parseScoreExpression(editingScoreValue) !== null ||
                                                                editingScoreValue.trim() === ''
                                                            ) {
                                                                void updateScore(
                                                                    roundIndex,
                                                                    playerIndex,
                                                                    editingScoreValue,
                                                                );
                                                            }
                                                            setEditingScoreCell(null);
                                                            setEditingScoreValue('');
                                                        }
                                                    }}
                                                />
                                                <Text style={styles.cumulativeText}>
                                                    Total : {roundToTwo(cumulative)}
                                                </Text>
                                            </View>
                                        );
                                    })}
                                    <View style={styles.addPlayerSpacer} />
                                </View>
                            ))}
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
                                        onFocus={() =>
                                            setFocusedInputCount((current) => current + 1)
                                        }
                                        onBlur={() =>
                                            setFocusedInputCount((current) =>
                                                Math.max(0, current - 1),
                                            )
                                        }
                                        keyboardType="decimal-pad"
                                        style={styles.modalInput}
                                        disableFullscreenUI={true}
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
                    </View>
                </ScrollView>
            </SafeAreaView>
            <View
                pointerEvents="box-none"
                style={[
                    styles.floatingButtonContainer,
                    { bottom: floatingButtonBottom, right: floatingButtonRight },
                ]}
            >
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
        </>
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
    floatingButtonContainer: {
        position: 'absolute',
        right: 12,
        zIndex: 20,
        elevation: 20,
    },
    headerButton: {
        marginRight: 10,
        backgroundColor: '#1f6feb',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    headerButtonPressed: { opacity: 0.85 },
    headerButtonDisabled: { opacity: 0.45 },
    headerButtonText: { color: '#fff', fontSize: 11, fontWeight: '700' },
    tableWrapper: { paddingBottom: 20, minWidth: '100%' },
    tableContent: { width: '100%' },
    headerRow: {
        flexDirection: 'row',
        minWidth: '100%',
        borderBottomWidth: 1,
        borderBottomColor: '#d7def1',
        backgroundColor: '#f5f8ff',
    },
    headerCell: {
        width: 114,
        minHeight: 50,
        borderRightWidth: 1,
        borderRightColor: '#d7def1',
        padding: 6,
        justifyContent: 'center',
    },
    roundHeaderCell: { width: 68 },
    headerText: { fontWeight: '700', color: '#1d2a4f' },
    playerNameInput: {
        borderWidth: 1,
        borderColor: '#c7d0ea',
        borderRadius: 7,
        paddingHorizontal: 8,
        paddingVertical: 4,
        marginBottom: 1,
        fontSize: 14,
        flex: 1,
    },
    playerHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    validateButton: {
        backgroundColor: '#1f6feb',
        borderRadius: 999,
        width: 24,
        height: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    validateButtonDisabled: { opacity: 0.35 },
    validateButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    addPlayerCell: {
        width: 31,
        minHeight: 50,
        alignItems: 'center',
        justifyContent: 'center',
        borderRightWidth: 1,
        borderRightColor: '#d7def1',
    },
    addPlayerSpacer: { width: 31, borderRightWidth: 1, borderRightColor: '#ecf0fb' },
    addPlayerButton: {
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1f6feb',
    },
    addPlayerButtonPressed: { opacity: 0.8 },
    addPlayerButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    deleteText: { color: '#b02a2a', fontSize: 12 },
    verticalArea: { flex: 1 },
    verticalAreaContent: { paddingBottom: 400, minWidth: '100%' },
    dataRow: {
        flexDirection: 'row',
        minWidth: '100%',
        borderBottomWidth: 1,
        borderBottomColor: '#ecf0fb',
    },
    roundCell: {
        width: 55,
        borderRightWidth: 1,
        borderRightColor: '#ecf0fb',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fbfcff',
    },
    roundText: { fontWeight: '700', color: '#30406b' },
    scoreCell: { width: 114, borderRightWidth: 1, borderRightColor: '#ecf0fb', padding: 8 },
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
