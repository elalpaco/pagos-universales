import { config } from "../config.js";
import simulatedGateway from "./gateways/simulated.js";
import wompiGateway from "./gateways/wompi.js";
import simulatedBillerProvider from "./billers/simulated.js";
import manualPayoutProvider from "./payouts/manual.js";

const gateways = {
  simulated: simulatedGateway,
  wompi: wompiGateway,
};

export function getGateway() {
  return gateways[config.paymentGateway] || simulatedGateway;
}

export function getBillerProvider() {
  return simulatedBillerProvider;
}

export function getPayoutProvider() {
  return manualPayoutProvider;
}

export default { getGateway, getBillerProvider, getPayoutProvider };
