/* Timecard Server 
 * Copyright 2011 Jaakko-Heikki Heusala <jheusala@iki.fi>
 * Licensed under the AGPL -- see LICENSE.txt
 */

var app = require('./app.js'),
    foreach = require('snippets').foreach,
    io = module.exports = require('socket.io').listen(app),
    data = require('./data.js'),
    http_post_mod = require('./http_post.js'),
    initfn = require('./fn.js').init,
    utils = require('./utils.js'),
    config = require('./config.js'),
    _loaded = {};


/* Configure Socket.IO */
// See https://github.com/LearnBoost/Socket.IO/wiki/Configuring-Socket.IO
io.configure('development', function(){
	//io.set('log level', 1);
	//io.set('transports', ['websocket', 'htmlfile', 'xhr-polling']);
	//io.set('transports', ['xhr-polling']);
	
	io.set('log level', 1);
	//io.set('transports', ['xhr-polling']);
	//io.set('transports', ['websocket', 'htmlfile', 'xhr-polling']);
	if(config.io) {
		if(config.io.log_level) {
			io.set('log level', config.io.log_level);
		}
		if(config.io.transports) {
			io.set('transports', config.io.transports);
		}
	}
});

io.configure('production', function(){
	io.set('log level', 1);
	//io.set('transports', ['xhr-polling']);
	//io.set('transports', ['websocket', 'htmlfile', 'xhr-polling']);
	
	if(config.io) {
		if(config.io.log_level) {
			io.set('log level', config.io.log_level);
		}
		if(config.io.transports) {
			io.set('transports', config.io.transports);
		}
	}
});

/* Connection IO Event */
io.sockets.on('connection', function(socket) {
	
	/* Initialize client */
	socket.on('client:init', function(fn) {
		fn = initfn(fn);
		
		function prepare_reply(d) {
			var reply = {'projects':[],'times':[]};
			foreach(d.projects).each(function(o) {
				reply.projects.push({'id':o.id,'name':o.name});
			});
			if(d.countdown) {
				reply.countdown = {
					'started':d.countdown.started.getTime(),
					'project':{
						'id':d.countdown.project.id,
						'name':d.countdown.project.name }};
			}
			foreach(d.times).each(function(o) {
				reply.times.push({
					'id':o.id,
					'started': o.started.getTime(),
					'stopped': o.stopped.getTime(),
					'project': {'id':o.project.id,'name':o.project.name} });
			});
			return reply;
		}
		
		if(_loaded.data) {
			fn(undefined, prepare_reply(_loaded.data));
			return;
		}
		
		data.load('./db/data.json', function(err, d) {
			if(err) {
				console.log('Error: ' + err);
				if(err.stack) console.log('stack:\n' + err.stack);
				fn(''+err);
				return;
			}
			
			_loaded.data = d;
			
			// Load modules
			//http_post_mod.init(d);
			
			fn(undefined, prepare_reply(_loaded.data) );
		});
	});
	
	/* Add new project */
	socket.on('client:project:add', function(name, fn) {
		fn = initfn(fn);
		var p;
		if(!_loaded.data) {
			fn("not initialized");
			return;
		}
		p = new data.Project({'name':name});
		// FIXME: Move this code as _loaded.data.addProject() or similar
		_loaded.data.projects.push(p);
		_loaded.data.changed(true);
		io.sockets.emit('project:add', {'id':p.id,'name':p.name});
		fn();
	});
	
	/* Start project */
	function do_data_start(p, fn) {
		fn = initfn(fn);
		_loaded.data.start(p, function(err) {
			if(err) {
				fn(''+err);
				return;
			}
			io.sockets.emit('project:start', {'id':p.id, 'name':p.name} );
			fn();
		});
	}
	
	/* Stop project */
	function do_data_stop(fn) {
		fn = initfn(fn);
		_loaded.data.stop(function(err, countdown) {
			var reply;
			if(err) {
				fn(''+err);
				return;
			}
			
			reply = {'started': countdown.started.getTime(),
			         'stopped': countdown.stopped.getTime(),
			         'project': {'id':countdown.project.id, 'name':countdown.project.name}};
			
			io.sockets.emit('project:stop', reply);
			fn();
		});
	}
	
	/* Start project */
	socket.on('client:project:start', function(id, fn) {
		fn = initfn(fn);
		_loaded.data.getProjectByID(id, function(err, project) {
			if(err) {
				fn(''+err);
				return;
			}
			if(!project) {
				fn('project not found for ID: ' + id);
				return;
			}
			_loaded.data.started(function(running) {
				if(running) {
					// Stop
					do_data_stop(function(err) {
						if(err) {
							fn(''+err);
							return;
						}
						
						// Start 
						do_data_start(project, function(err) {
							if(err) fn(''+err);
							else fn();
						});
					});
				} else {
					// Start 
					do_data_start(project, function(err) {
						if(err) fn(''+err);
						else fn();
					});
				}
			});
		});
	});
		
	/* Stop project */
	socket.on('client:project:stop', function(fn) {
		fn = initfn(fn);
		_loaded.data.started(function(running) {
			if(!running) return;
			// Stop
			do_data_stop(function(err) {
				if(err) {
					fn(''+err);
					return;
				}
				fn();
			});
		});
	});
	
	
});

/* EOF */
