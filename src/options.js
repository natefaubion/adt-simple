var pragmas = {
  overrideApply: /@overrideapply\b/gmi,
  newRequired: /@newrequired\b/gmi,
  scoped: /@scoped\b/gmi
};

if (ctx[0].token.leadingComments) {
  ctx[0].token.leadingComments.forEach(function(comment) {
    Object.keys(pragmas).forEach(function(optName) {
      if (comment.value.match(pragmas[optName])) {
        options[optName] = true;
      }
    });
  });
}
