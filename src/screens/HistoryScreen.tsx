import { JSX, useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import { deleteGame, loadGames } from '../services/storage';
import { Game } from '../types/game';

type RootDrawerParamList = {
    Game: { gameId: string } | undefined;
    History: undefined;
    Settings: undefined;
};

const formatDate = (value: string): string => new Date(value).toLocaleString();

const getPlayerLabel = (game: Game): string => {
    const names = Array.from(game.players).filter((name) => name.trim().length > 0);
    if (names.length === 0) return 'Joueurs non nommés';
    if (names.length <= 3) return names.join(', ');
    return `${names.slice(0, 3).join(', ')}...`;
};

const getTotals = (game: Game): { name: string; total: number }[] => {
    return Array.from(game.players).map((playerName, playerIndex) => {
        const total = game.rounds.reduce((sum, round) => {
            const score = round.scores[playerIndex]?.score;
            return sum + (score ?? 0);
        }, 0);
        return { name: playerName.trim() || 'Sans nom', total };
    });
};

export const HistoryScreen = (): JSX.Element => {
    const navigation = useNavigation<DrawerNavigationProp<RootDrawerParamList>>();
    const [games, setGames] = useState<Game[]>([]);
    const [selectedGameId, setSelectedGameId] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        const list = await loadGames();
        const sorted = [...list].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
        setGames(sorted);

        if (sorted.length > 0 && !selectedGameId) {
            setSelectedGameId(sorted[0].id);
        } else if (selectedGameId && !sorted.some((g) => g.id === selectedGameId)) {
            setSelectedGameId(null);
        }
    }, [selectedGameId]);

    useFocusEffect(
        useCallback(() => {
            void refresh();
        }, [refresh]),
    );

    const selectedGame = useMemo(
        () => games.find((g) => g.id === selectedGameId) ?? null,
        [games, selectedGameId],
    );

    const handleDelete = (gameId: string) => {
        Alert.alert('Supprimer la partie', 'Confirmer la suppression ?', [
            { text: 'Annuler', style: 'cancel' },
            {
                text: 'Supprimer',
                style: 'destructive',
                onPress: async () => {
                    await deleteGame(gameId);
                    await refresh();
                },
            },
        ]);
    };

    const handleOpenGame = (gameId: string) => {
        navigation.navigate('Game', { gameId });
    };

    return (
        <View style={styles.screen}>
            <Text style={styles.title}>Parties enregistrées</Text>

            <FlatList
                data={games}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                    <Pressable
                        style={[styles.item, selectedGameId === item.id && styles.itemSelected]}
                        onPress={() => setSelectedGameId(item.id)}
                    >
                        <View style={styles.itemMain}>
                            <Text style={styles.itemDate}>{formatDate(item.createdAt)}</Text>
                            <Text style={styles.itemPlayers}>{getPlayerLabel(item)}</Text>
                        </View>
                        <Pressable onPress={() => handleDelete(item.id)}>
                            <Text style={styles.deleteText}>Suppr.</Text>
                        </Pressable>
                    </Pressable>
                )}
                ListEmptyComponent={
                    <Text style={styles.emptyText}>Aucune partie enregistrée.</Text>
                }
                style={styles.list}
            />

            {selectedGame && (
                <View style={styles.detailCard}>
                    <Text style={styles.detailTitle}>Détail</Text>
                    <Text style={styles.detailSubtitle}>{formatDate(selectedGame.createdAt)}</Text>
                    {getTotals(selectedGame).map((entry) => (
                        <View key={entry.name} style={styles.detailRow}>
                            <Text style={styles.detailName}>{entry.name}</Text>
                            <Text style={styles.detailValue}>{entry.total}</Text>
                        </View>
                    ))}
                    <Pressable
                        style={styles.openButton}
                        onPress={() => handleOpenGame(selectedGame.id)}
                    >
                        <Text style={styles.openButtonText}>Ouvrir cette partie</Text>
                    </Pressable>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#f9fbff', padding: 16 },
    title: { fontSize: 24, fontWeight: '700', marginBottom: 12, color: '#17223b' },
    list: { flexGrow: 0, maxHeight: '52%' },
    item: {
        backgroundColor: '#fff',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#dde4f5',
        padding: 12,
        marginBottom: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    itemSelected: { borderColor: '#6b8fd8', backgroundColor: '#eef4ff' },
    itemMain: { flex: 1, marginRight: 12 },
    itemDate: { fontSize: 14, fontWeight: '700', color: '#23345f', marginBottom: 2 },
    itemPlayers: { color: '#5a678f', fontSize: 13 },
    deleteText: { color: '#ba2a2a', fontSize: 12, fontWeight: '600' },
    emptyText: { color: '#5a678f', textAlign: 'center', marginTop: 20 },
    detailCard: {
        marginTop: 16,
        backgroundColor: '#fff',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#dde4f5',
        padding: 14,
        flex: 1,
    },
    detailTitle: { fontSize: 18, fontWeight: '700', color: '#1f2c4b' },
    detailSubtitle: { marginTop: 2, marginBottom: 10, fontSize: 12, color: '#5d6b93' },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderBottomWidth: 1,
        borderBottomColor: '#eef2fb',
        paddingVertical: 8,
    },
    detailName: { fontWeight: '600', color: '#253967' },
    detailValue: { fontWeight: '700', color: '#1f2f54' },
    openButton: {
        backgroundColor: '#1f6feb',
        borderRadius: 8,
        paddingVertical: 10,
        paddingHorizontal: 16,
        marginTop: 12,
        alignItems: 'center',
    },
    openButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
