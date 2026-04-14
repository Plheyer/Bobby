import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { StatusBar } from 'expo-status-bar';
import { GameScreen } from './src/screens/GameScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';

type RootDrawerParamList = {
    Game: { gameId: string } | undefined;
    History: undefined;
    Settings: undefined;
};

const Drawer = createDrawerNavigator<RootDrawerParamList>();

export default function App() {
    return (
        <NavigationContainer>
            <StatusBar style="dark" />
            <Drawer.Navigator initialRouteName="Game">
                <Drawer.Screen
                    name="Game"
                    component={GameScreen}
                    options={{ title: 'Partie en cours' }}
                />
                <Drawer.Screen
                    name="History"
                    component={HistoryScreen}
                    options={{ title: 'Historique' }}
                />
                <Drawer.Screen
                    name="Settings"
                    component={SettingsScreen}
                    options={{ title: 'Paramètres' }}
                />
            </Drawer.Navigator>
        </NavigationContainer>
    );
}
