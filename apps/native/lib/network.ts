import * as Network from 'expo-network';

/** True when the phone can reach the server. An unknown reachability still counts as online. */
export async function deviceOnline(): Promise<boolean> {
	const state = await Network.getNetworkStateAsync();
	return state.isConnected === true && state.isInternetReachable !== false;
}
