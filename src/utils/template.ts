/**
 * Take an input string and replace templates with variable values.
 * @param input A string, which contains "{varName}" to be replaced
 * @param templateVariables A map of {[varName]: value}.
 * @returns The input string templated with the values given in templateVariables.
 */
export default function template(input: string, templateVariables: Record<string, string>) {
    let out = input;
    for (const [name, value] of Object.entries(templateVariables)) {
        out = out.replaceAll(`{${name}}`, value);
    }
    return out;
}