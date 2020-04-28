const fs = require('fs-extra');
const path = require('path');
const { parseBindString } = require('../../libs/helpers');

module.exports = function(app) {
    let router = app.webserver.router;

    let publicPath = app.conf.relativePath(app.conf.get('webserver.public_dir'));

    router.get('kiwi.bnc_plugin', '/kiwibnc_plugin.html', async (ctx, next) => {
        ctx.body = await fs.readFile(
            path.join(__dirname, 'kiwibnc_plugin.html'),
            { encoding: 'utf8' },
        );
    });

    router.get('kiwi.config', '/static/config.json', async (ctx, next) => {
        let config = await fs.readFile(path.join(publicPath, 'static', 'config.json'));
        config = JSON.parse(config);
        config = {
            ...config,
            '## comment': 'Auto generated by KiwiBNC',
            kiwiServer: '',
            startupScreen: 'welcome',
        };

        config.startupOptions = {
            ...config.startupOptions,
            port: '{{port}}',
            server: '{{hostname}}',
            direct_path: '/',
            tls: '{{tls}}',
            direct: true,
            channel: '',
            bouncer: true,
            remember_buffers: false,
            public_register : app.conf.get('webchat.public_register', false),
        };

        // Add our kiwi plugin to the config
        config.plugins = config.plugins || [];
        config.plugins.push({
            name: 'kiwibnc',
            url: router.url('kiwi.bnc_plugin', {}),
            basePath: ctx.basePath,
        });

        let extraConf = app.conf.get('webchat');
        for (let prop in extraConf) {
            config[prop] = extraConf[prop];
        }

        ctx.body = config;
    });

    app.webserver.router.post('kiwi.config', '/api/register', async (ctx, next) => {
        if (!app.conf.get('webchat.public_register', false)) {
            ctx.body = {error: 'forbidden'};
            return;
        }

        let body = ctx.request.body;
        if (!body.username || !body.password) {
            ctx.body = {error: 'missing_params'};
            return;
        }

        if (await app.userDb.getUser(body.username)) {
            ctx.body = {error: 'username_in_use'};
            return;
        }

        let admin = false;

        // If this is the first user, make them an admin
        let usersExist = await app.db.factories.User.query().first();
        if (!usersExist) {
            admin = true;
        }

        try {
            let user = await app.userDb.addUser(body.username, body.password, admin);
        } catch (err) {
            if (err.message === 'Invalid username') {
                ctx.body = {error: 'invalid_username'};
            } else {
                ctx.body = {error: 'unknown_error'};
            }

            return;
        }

        ctx.body = {error: false};
    });
};
