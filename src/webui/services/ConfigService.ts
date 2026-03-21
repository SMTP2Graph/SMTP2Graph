import fs from 'fs';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import Ajv from 'ajv';

export class ConfigService
{
    #configFile: string;
    #schemaFile: string;

    constructor(configFile: string = 'config.yml', schemaFile: string = 'config.schema.json')
    {
        this.#configFile = configFile;
        this.#schemaFile = schemaFile;
    }

    getConfig(showSecrets: boolean = false): any
    {
        const content = fs.readFileSync(this.#configFile, 'utf-8');
        const config = parseYaml(content);

        if(!showSecrets)
            this.#maskSecrets(config);

        return config;
    }

    getSchema(): any
    {
        const content = fs.readFileSync(this.#schemaFile, 'utf-8');
        return JSON.parse(content);
    }

    updateConfig(newConfig: any): {success: boolean, errors?: string[]}
    {
        // Validate against JSON schema
        try {
            const schema = this.getSchema();
            const ajv = new Ajv({allErrors: true});
            const validate = ajv.compile(schema);
            const valid = validate(newConfig);

            if(!valid && validate.errors)
            {
                const errors = validate.errors.map(e =>
                    `${e.instancePath || '/'}: ${e.message}`
                );
                return {success: false, errors};
            }
        } catch(error) {
            return {success: false, errors: [`Schema validation error: ${String(error)}`]};
        }

        // Write YAML
        try {
            const yamlContent = stringifyYaml(newConfig, {indent: 2});
            fs.writeFileSync(this.#configFile, yamlContent, 'utf-8');
            return {success: true};
        } catch(error) {
            return {success: false, errors: [`Failed to write config: ${String(error)}`]};
        }
    }

    #maskSecrets(config: any)
    {
        // Mask send.appReg.secret
        if(config?.send?.appReg?.secret)
            config.send.appReg.secret = '********';

        // Mask account secrets
        if(config?.accounts)
        {
            for(const account of config.accounts)
            {
                if(account?.appReg?.secret)
                    account.appReg.secret = '********';
            }
        }

        // Mask user passwords
        if(config?.receive?.users)
        {
            for(const user of config.receive.users)
            {
                if(user?.password)
                    user.password = '********';
            }
        }

        // Mask webui password
        if(config?.webui?.password)
            config.webui.password = '********';
    }
}
