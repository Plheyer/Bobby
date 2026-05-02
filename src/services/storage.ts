import AsyncStorage from '@react-native-async-storage/async-storage';
import { Game, Round, Settings } from '../types/game';
import { createId } from '../utils/ScoreCalculator';

const GAMES_KEY = '@bobby_games';
const SETTINGS_KEY = '@bobby_settings';
const CURRENT_GAME_KEY = '@bobby_current_game';

const DEFAULT_SETTINGS: Settings = {
    autoCompleteMode: 'fixed',
    fixedTotal: 100,
    scoreOrder: 'highest-wins',
    nullosLabel: 'Le nullos dernier',
    kingLabel: 'Puis le king',
};

const createEmptyRound = (players: string[]): Round => ({
    scores: players.map((playerName) => ({ playerName, score: null })),
});

export const createNewGame = (): Game => {
    const players = new Set(['Joueur 1']);
    return {
        id: createId(),
        createdAt: new Date().toISOString(),
        players,
        rounds: [createEmptyRound(Array.from(players))],
    };
};

// ==================== GAMES ====================

const serializeGame = (game: Game): Record<string, unknown> => ({
    ...game,
    players: Array.from(game.players),
});

const deserializeGame = (data: Record<string, unknown>): Game => ({
    id: String(data.id || createId()),
    createdAt: String(data.createdAt || new Date().toISOString()),
    players: new Set(Array.isArray(data.players) ? data.players : ['Joueur 1']),
    rounds: Array.isArray(data.rounds) ? data.rounds : [],
});

export const loadGames = async (): Promise<Game[]> => {
    try {
        const data = await AsyncStorage.getItem(GAMES_KEY);
        if (!data) return [];
        const parsed = JSON.parse(data) as Record<string, unknown>[];
        return parsed.map(deserializeGame);
    } catch (error) {
        console.error('Error loading games:', error);
        return [];
    }
};

export const saveGame = async (game: Game): Promise<void> => {
    try {
        const games = await loadGames();
        const index = games.findIndex((g) => g.id === game.id);

        if (index >= 0) {
            games[index] = game;
        } else {
            games.push(game);
        }

        await AsyncStorage.setItem(GAMES_KEY, JSON.stringify(games.map(serializeGame)));
    } catch (error) {
        console.error('Error saving game:', error);
        throw error;
    }
};

export const deleteGame = async (gameId: string): Promise<void> => {
    try {
        const games = await loadGames();
        const filtered = games.filter((g) => g.id !== gameId);
        await AsyncStorage.setItem(GAMES_KEY, JSON.stringify(filtered.map(serializeGame)));
    } catch (error) {
        console.error('Error deleting game:', error);
        throw error;
    }
};

export const getGame = async (gameId: string): Promise<Game | null> => {
    try {
        const games = await loadGames();
        return games.find((g) => g.id === gameId) || null;
    } catch (error) {
        console.error('Error getting game:', error);
        return null;
    }
};

// ==================== CURRENT GAME ====================

export const saveCurrentGameId = async (gameId: string | null): Promise<void> => {
    try {
        if (gameId) {
            await AsyncStorage.setItem(CURRENT_GAME_KEY, gameId);
        } else {
            await AsyncStorage.removeItem(CURRENT_GAME_KEY);
        }
    } catch (error) {
        console.error('Error saving current game ID:', error);
    }
};

export const loadCurrentGameId = async (): Promise<string | null> => {
    try {
        return await AsyncStorage.getItem(CURRENT_GAME_KEY);
    } catch (error) {
        console.error('Error loading current game ID:', error);
        return null;
    }
};

// ==================== SETTINGS ====================

export const loadSettings = async (): Promise<Settings> => {
    try {
        const data = await AsyncStorage.getItem(SETTINGS_KEY);
        if (!data) return DEFAULT_SETTINGS;
        return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
    } catch (error) {
        console.error('Error loading settings:', error);
        return DEFAULT_SETTINGS;
    }
};

export const saveSettings = async (settings: Settings): Promise<void> => {
    try {
        await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
        console.error('Error saving settings:', error);
    }
};

export const getSettingsDefaults = (): Settings => DEFAULT_SETTINGS;
